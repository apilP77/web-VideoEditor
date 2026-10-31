import CropTrim from './crop-trim/CropTrim.jsx'
import Speed from './speed/Speed.jsx'
import Transcript from './transcript/Transcript.jsx'

// Set ready: true when a tool is finished.
export const tools = [
  {
    id: 'captions',
    name: 'Captions generator',
    description: 'Create styled, word-timed captions and export them with your video.',
    icon: 'Captions',
    accent: 'pink',
    ready: false,
    component: null,
  },
  {
    id: 'transcript',
    name: 'Transcript generator',
    description: 'Turn speech into an editable transcript with useful timestamps.',
    icon: 'FileText',
    accent: 'teal',
    ready: true,
    component: Transcript,
  },
  {
    id: 'speed',
    name: 'Speed changer',
    description: 'Slow down or speed up a clip while keeping its audio in sync.',
    icon: 'Gauge',
    accent: 'amber',
    ready: true,
    component: Speed,
  },
  {
    id: 'batch-captions',
    name: 'Batch captions',
    description: 'Caption several videos in one queue with shared settings.',
    icon: 'Layers',
    accent: 'teal',
    ready: false,
    component: null,
  },
  {
    id: 'crop-trim',
    name: 'Crop and trim',
    description: 'Set a video’s framing and duration, then preview your result.',
    icon: 'Crop',
    accent: 'purple',
    ready: true,
    component: CropTrim,
  },
]
