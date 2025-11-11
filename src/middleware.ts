import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Проверка авторизации
  const { data: { user } } = await supabase.auth.getUser()

  // Защита /annotations/* роутов - требуется авторизация
  if (request.nextUrl.pathname.startsWith('/annotations') && !user) {
    const redirectUrl = new URL('/login', request.url)
    redirectUrl.searchParams.set('redirect', request.nextUrl.pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // Защита /admin/* роутов - требуется роль admin
  if (request.nextUrl.pathname.startsWith('/admin')) {
    if (!user) {
      const redirectUrl = new URL('/login', request.url)
      redirectUrl.searchParams.set('redirect', request.nextUrl.pathname)
      return NextResponse.redirect(redirectUrl)
    }

    // Проверка роли admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      // Не админ - редирект на главную страницу задач
      return NextResponse.redirect(new URL('/annotations/tasks', request.url))
    }
  }

  // Редирект с /login на /annotations/tasks если уже авторизован
  if (request.nextUrl.pathname === '/login' && user) {
    const redirect = request.nextUrl.searchParams.get('redirect')
    return NextResponse.redirect(new URL(redirect || '/annotations/tasks', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/annotations/:path*',
    '/admin/:path*',
    '/login'
  ]
}

