const { useRef } = React = require('react')
const ReactDOM = require('react-dom')
const { createStore, applyMiddleware } = require('redux')
const { Provider, connect } = require('react-redux')
const { produce } = require('immer')
const THREE = require('three')
const { sv } = require('seview')

h = sv(node => {
  if (typeof node === "string") {
    return node;
  }
  const attrs = node.attrs || {};
  if (attrs.innerHTML) {
    attrs.dangerouslySetInnerHTML = { __html: attrs.innerHTML };
    delete attrs.innerHTML;
  }
  const args = [node.tag, node.attrs || {}].concat(node.children || []);
  return React.createElement.apply(null, args);
})

const initialState = {
  objects: {}
}

const reducer = (state = initialState, action) => {
  return produce(state, draft => {
    switch (action.type) {
      case 'OBJECT_CREATE':
        draft.objects[action.payload.id] = action.payload
        return

      case 'OBJECT_UPDATE':
        draft.objects[action.payload.id] = {
          ...state.objects[action.payload.id],
          ...action.payload
        }
        return

      case 'OBJECT_DELETE':
        delete draft.objects[action.payload.id]
        return

      }
  })
}
const store = createStore(reducer)
window.$r = { store }

const objectCreate = (id, values) => ({ type: 'OBJECT_CREATE', payload: { id, ...values } })
const objectUpdate = (id, values) => ({ type: 'OBJECT_UPDATE', payload: { id, ...values } })
const objectDelete = (id) => ({ type: 'OBJECT_DELETE', payload: { id } })

const wireframeSphereFactory = (radius, widthSegments = 8, heightSegments = 8) => {
  const geometry = new THREE.SphereBufferGeometry(radius, widthSegments, heightSegments)
  const wireframe = new THREE.WireframeGeometry(geometry)
  const line = new THREE.LineSegments(wireframe, new THREE.LineBasicMaterial({ color: 0xff0000 }))
  line.material.depthTest = false
  line.material.opacity = 0.5
  line.material.transparent = true
  return line
}

const setup = () => {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 200)
  camera.position.z = 10

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setSize(window.innerWidth, window.innerHeight)
  document.body.appendChild(renderer.domElement)
  renderer.domElement.style.position = 'absolute'
  renderer.domElement.style.top = 0
  renderer.domElement.style.left = 0
  renderer.domElement.style.bottom = 0
  renderer.domElement.style.right = 0
  renderer.domElement.style.zIndex = -1

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.35)
  ambientLight.color.setHSL(0.1, 1, 0.95)
  scene.add(ambientLight)

  const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.5)
  hemisphereLight.color.setHSL(0.6, 1, 0.95)
  hemisphereLight.groundColor.setHSL(0.095, 1, 0.75)
  hemisphereLight.position.set(0, 0, 500)
  scene.add(hemisphereLight)

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.65)
  directionalLight.color.setHSL(0.1, 1, 0.95)
  directionalLight.position.set(-1, 1, 1)
  directionalLight.position.multiplyScalar(50)
  scene.add(directionalLight)

  const cache = {}

  const CREATE = Symbol('create')
  const UPDATE = Symbol('update')
  const DELETE = Symbol('delete')

  return state => {
    let tasks = []

    // if object is new, create
    for (let id in state.objects) {
      // if object is in the state, but not the scene, we need to create it
      if (!cache[id]) {
        // create
        tasks.push([CREATE, { object: state.objects[id] }])
      }
    }

    // for every child in the scene
    for (let id in cache) {
      let component = cache[id].component

      // find it in the objects list
      let object = state.objects[id]

      // if the object is still in the list
      if (object) {
        // update (unless just created)
        // but only if the values have changed
        if (cache[id].props !== object) {
          tasks.push([UPDATE, { object, component }])
        }
      } else {
        // the object is in the scene, but not the list
        // so we're supposed to remove it from the scene
        tasks.push([DELETE, { id }])
      }
    }

    for (let [kind, { id, object, component }] of tasks) {
      switch (kind) {
        case CREATE:
          console.log('new', object.id)
          cache[object.id] = { component: Component({ scene, ...object }), props: object }
          break
        case UPDATE:
          console.log('update', object.id)
          cache[object.id].component()
          cache[object.id] = { component: Component({ scene, ...object }), props: object }
          break
        case DELETE:
          console.log('delete', id)
          cache[id].component()
          delete cache[id]
          break
      }
    }

    // if object was deleted, remove
    renderer.render(scene, camera)
  }
}

const Component = ({ scene, ...props }) => {
  console.log('new Component', props)

  const sphere = wireframeSphereFactory(3)
  sphere.position.x = props.x
  sphere.position.y = props.y
  sphere.position.z = props.z

  scene.add(sphere) // TODO closure

  return function cleanup () {
    console.log('cleanup', props)
    scene.remove(sphere)
  }
}

const render = setup()

store.subscribe(() => {
  let state = store.getState()
  render(state)
})

store.dispatch(objectCreate(THREE.Math.generateUUID(), { x: 0, y: 0, z: 0 }))

const Explorer = connect(
  state => ({
    objects: state.objects
  }),
  {
    objectUpdate,
    objectCreate,
    objectDelete
  }
)(
  ({
    objects,
    objectUpdate,
    objectCreate,
    objectDelete
  }) => {
    const onAdd = event => {
      objectCreate(THREE.Math.generateUUID(), { x: 0, y: 0, z: 0 })
    }
    const onRemove = event => {
      let values = Object.values(objects)
      let last = values[values.length - 1]
      if (last) {
        objectDelete(last.id)
      }
    }

    return h(['div', 'Explorer', [
      Object.values(objects).map(object => [
        ['div', { style: { paddingBottom: 10 } }, [
          ['div', [
            ['span', 'x'],
            ['input[type=range]', {
              value: object.x,
              min: -5,
              max: 5,
              step: 0.1,
              onChange: event => objectUpdate(object.id, { x: parseFloat(event.target.value) })
            }]
          ]],

          ['div', [
            ['span', 'y'],
            ['input[type=range]', {
              value: object.y,
              min: -5,
              max: 5,
              step: 0.1,
              onChange: event => objectUpdate(object.id, { y: parseFloat(event.target.value) })
            }]
          ]],

          ['div', [
            ['span', 'z'],
            ['input[type=range]', {
              value: object.z,
              min: -5,
              max: 5,
              step: 0.1,
              onChange: event => objectUpdate(object.id, { z: parseFloat(event.target.value) })
            }]
          ]]
        ]]
      ]),

      ['div', { style: { marginBottom: 20 } }, [
        ['button', { onClick: onAdd }, 'Add']
      ]],

      ['div', [
        ['button', { onClick: onRemove }, 'Remove']
      ]],

    ]])
  }
)

let container = document.createElement('div')
document.body.appendChild(container)
ReactDOM.render(
  h([
    Provider, { store }, [
      Explorer
    ]
  ]),
  container
)
