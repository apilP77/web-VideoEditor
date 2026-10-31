import { tools } from './tools/index.js'

function App() {
  const tool = tools.find(({ id }) => id === 'crop-trim')
  const ToolComponent = tool.component
  return <ToolComponent />
}

export default App
