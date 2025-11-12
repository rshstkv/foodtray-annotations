'use client'

import { Image } from '@/types/annotations'

interface ImageGridProps {
  images: Image[]
  activeImageId: string | null
  onImageSelect: (imageId: string) => void
  children: (image: Image, index: number) => React.ReactNode
}

export function ImageGrid({ images, activeImageId, onImageSelect, children }: ImageGridProps) {
  const mainImage = images.find(img => img.image_type === 'main')
  const qualityImage = images.find(img => img.image_type === 'quality')

  const orderedImages = [mainImage, qualityImage].filter(Boolean) as Image[]

  return (
    <div className="flex-1 grid grid-cols-2 gap-4 p-6 bg-gray-50">
      {orderedImages.map((image, index) => {
        const isActive = activeImageId === image.id
        
        return (
          <div 
            key={image.id} 
            onClick={() => onImageSelect(image.id)}
            className={`
              flex-1 rounded-lg overflow-hidden cursor-pointer transition-all
              ${isActive 
                ? 'ring-4 ring-blue-500 shadow-lg' 
                : 'ring-2 ring-gray-200 opacity-70 hover:opacity-90'
              }
            `}
          >
            {children(image, index)}
          </div>
        )
      })}
    </div>
  )
}

