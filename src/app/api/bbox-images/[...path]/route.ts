import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    const imagePath = params.path.join('/')

    // Получаем изображение из storage
    const { data, error } = await supabase
      .storage
      .from('bbox-images')
      .download(imagePath)

    if (error || !data) {
      console.error('Error downloading image:', error)
      return new NextResponse('Image not found', { status: 404 })
    }

    // Конвертируем Blob в ArrayBuffer для отправки
    const buffer = await data.arrayBuffer()

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    })
  } catch (error) {
    console.error('Unexpected error:', error)
    return new NextResponse('Internal server error', { status: 500 })
  }
}

