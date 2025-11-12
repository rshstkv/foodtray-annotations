'use client'

import { Image } from '@/types/annotations'

interface ImageGridProps {
  images: Image[]
  children: (image: Image, index: number) => React.ReactNode
}

export function ImageGrid({ images, children }: ImageGridProps) {
  const mainImage = images.find(img => img.image_type === 'main')
  const qualityImage = images.find(img => img.image_type === 'quality')

  const orderedImages = [mainImage, qualityImage].filter(Boolean) as Image[]

  return (
    <div className="flex-1 grid grid-cols-2 gap-6 p-6 bg-gray-50">
      {orderedImages.map((image, index) => (
        <div key={image.id} className="flex flex-col gap-2">
          {/* Image type label */}
          <div className="text-sm font-medium text-gray-700">
            {image.image_type === 'main' ? 'Main Image' : 'Quality Check'}
          </div>

          {/* Image with annotations */}
          <div className="flex-1 bg-white rounded-lg shadow-sm overflow-hidden">
            {children(image, index)}
          </div>
        </div>
      ))}
    </div>
  )
}

