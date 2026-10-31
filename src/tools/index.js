import CropTrim from './crop-trim/CropTrim.jsx'

/**
 * Available video tools and their route metadata.
 */
export const tools = [
  {
    id: 'crop-trim',
    name: 'Crop and trim',
    description: 'Crop a video frame and trim its duration.',
    component: CropTrim,
  },
]
