import { useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

const NotFound = () => {
  const { t } = useTranslation()
  const location = useLocation()

  useEffect(() => {
    console.error('404 Error: User attempted to access non-existent route:', location.pathname)
  }, [location.pathname])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-gray-100">
          {t('pages.notFound.code')}
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-400 mb-4">{t('pages.notFound.title')}</p>
        <a
          href="/"
          className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline"
        >
          {t('pages.notFound.returnHome')}
        </a>
      </div>
    </div>
  )
}

export default NotFound
