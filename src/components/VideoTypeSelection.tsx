import { Button } from '@/components/ui/button'
import { useNavigate, useLocation } from 'react-router-dom'

type VideoType = 'all' | 'shorts' | 'videos'

interface VideoTypeSelectionProps {
  selectedType: VideoType
  //  onTypeChange: (type: VideoType) => void;
}

export function VideoTypeSelection({ selectedType /*, onTypeChange*/ }: VideoTypeSelectionProps) {
  const navigate = useNavigate()
  const location = useLocation()

  const handleTypeChange = (type: VideoType) => {
    const searchParams = new URLSearchParams(location.search)
    searchParams.set('videoType', type)
    navigate(`${location.pathname}?${searchParams.toString()}`)
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant={selectedType === 'all' ? 'default' : 'outline'}
        onClick={() => handleTypeChange('all')}
      >
        All
      </Button>
      <Button
        variant={selectedType === 'shorts' ? 'default' : 'outline'}
        onClick={() => handleTypeChange('shorts')}
      >
        Shorts
      </Button>
      <Button
        variant={selectedType === 'videos' ? 'default' : 'outline'}
        onClick={() => handleTypeChange('videos')}
      >
        Videos
      </Button>
    </div>
  )
}
