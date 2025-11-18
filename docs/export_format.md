# Формат экспорта валидированных аннотаций

## API Endpoint

```
GET /api/admin/export?recognitionIds=100024,100025,100026
```

## Формат ответа

```json
{
  "recognitions": [
    {
      "recognition_id": 100024,
      "recipe": {
        "items": [
          {
            "item_id": 1,
            "item_type": "FOOD",
            "external_id": "4607034370015",
            "name": "Пельмени с говядиной",
            "quantity": 2,
            "bottle_orientation": null,
            "metadata": null
          },
          {
            "item_id": 2,
            "item_type": "FOOD",
            "external_id": "4607034370053",
            "name": "Сок яблочный 0.3л",
            "quantity": 1,
            "bottle_orientation": "vertical",
            "metadata": null
          },
          {
            "item_id": 3,
            "item_type": "PLATE",
            "external_id": null,
            "name": null,
            "quantity": 1,
            "bottle_orientation": null,
            "metadata": null
          },
          {
            "item_id": 4,
            "item_type": "BUZZER",
            "external_id": null,
            "name": null,
            "quantity": 1,
            "bottle_orientation": null,
            "metadata": {"color": "red"}
          }
        ]
      },
      "images": [
        {
          "camera_number": 1,
          "image_name": "Main",
          "storage_path": "recognitions/100024/camera1.jpg",
          "width": 1920,
          "height": 1080,
          "annotations": [
            {
              "item_id": 1,
              "bbox": {"x": 959, "y": 386, "w": 460, "h": 289},
              "is_occluded": false,
              "occlusion_metadata": null,
              "was_modified": true,
              "original_bbox": {"x": 955, "y": 380, "w": 465, "h": 295}
            },
            {
              "item_id": 1,
              "bbox": {"x": 100, "y": 100, "w": 450, "h": 280},
              "is_occluded": false,
              "occlusion_metadata": null,
              "was_modified": false,
              "original_bbox": null
            },
            {
              "item_id": 2,
              "bbox": {"x": 500, "y": 300, "w": 60, "h": 180},
              "is_occluded": true,
              "occlusion_metadata": {"level": "partial"},
              "was_modified": false,
              "original_bbox": null
            },
            {
              "item_id": 3,
              "bbox": {"x": 345, "y": 21, "w": 735, "h": 648},
              "is_occluded": false,
              "occlusion_metadata": null,
              "was_modified": false,
              "original_bbox": null
            }
          ]
        },
        {
          "camera_number": 2,
          "image_name": "Qualifying",
          "storage_path": "recognitions/100024/camera2.jpg",
          "width": 1920,
          "height": 1080,
          "annotations": [
            {
              "item_id": 1,
              "bbox": {"x": 800, "y": 400, "w": 440, "h": 270},
              "is_occluded": false,
              "occlusion_metadata": null,
              "was_modified": false,
              "original_bbox": null
            }
          ]
        }
      ]
    }
  ]
}
```

## Ключевые особенности

1. **recipe.items** - уникальные объекты на подносе с:
   - `item_id` - уникальный ID (используется в annotations)
   - `external_id` - EAN код блюда (null для PLATE, BUZZER, OTHER)
   - `name` - название блюда
   - `quantity` - количество из чека
   - `bottle_orientation` - ориентация бутылки ("horizontal"/"vertical"/null)
   - `metadata` - дополнительная информация (например, цвет зуммера)

2. **images[]** - фотографии с двух камер:
   - `camera_number` - номер камеры (1 или 2)
   - `image_name` - тип фото ("Main" для камеры 1, "Qualifying" для камеры 2)
   - `storage_path` - путь к файлу
   - `width`, `height` - размеры изображения

3. **images[].annotations** - bbox на каждой фотографии:
   - `item_id` - ссылка на item из recipe.items
   - `bbox` - валидированный bbox
   - `is_occluded` - объект перекрыт
   - `occlusion_metadata` - детали окклюзии
   - `was_modified` - bbox был изменен валидатором
   - `original_bbox` - исходный bbox от модели (если был изменен)

3. **Множественные аннотации** - если quantity=2, будет 2 аннотации с одним item_id

4. **Без активного меню** - не включает полный список доступных блюд


