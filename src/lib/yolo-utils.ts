import type { BBox } from '@/types/domain'
import type { YoloAnnotation, DetectionClassId } from '@/types/detection'

export function yoloToPixelBBox(yolo: YoloAnnotation, imgW: number, imgH: number): BBox {
  return {
    x: (yolo.x_center - yolo.width / 2) * imgW,
    y: (yolo.y_center - yolo.height / 2) * imgH,
    w: yolo.width * imgW,
    h: yolo.height * imgH,
  }
}

export function pixelBBoxToYolo(
  bbox: BBox,
  cls: DetectionClassId,
  imgW: number,
  imgH: number
): YoloAnnotation {
  return {
    class: cls,
    x_center: (bbox.x + bbox.w / 2) / imgW,
    y_center: (bbox.y + bbox.h / 2) / imgH,
    width: bbox.w / imgW,
    height: bbox.h / imgH,
  }
}
