import { useEffect, useState, useRef, useCallback, memo } from 'react'
import { formatDistanceToNow } from 'date-fns'

interface BulletComment {
  id: number
  text: string
  slot: number // which slot this comment occupies
  duration: number // animation duration in seconds
  expiresAt: number // timestamp when animation completes
  // Owner info
  ownerName: string
  ownerAvatar: string
  postedAt: Date
  zapAmount: number // sats
}

// Pre-generated comment with video timestamp
interface ScheduledComment {
  id: number
  text: string
  videoTime: number // video timestamp in seconds when this should appear
  ownerName: string
  ownerAvatar: string
  postedAt: Date
  zapAmount: number
}

// Demo users for random assignment
const DEMO_USERS = [
  { name: 'satoshi', avatar: 'https://i.pravatar.cc/150?u=satoshi' },
  { name: 'alice_nostr', avatar: 'https://i.pravatar.cc/150?u=alice' },
  { name: 'bob_zaps', avatar: 'https://i.pravatar.cc/150?u=bob' },
  { name: 'lightning_fan', avatar: 'https://i.pravatar.cc/150?u=lightning' },
  { name: 'nostr_dev', avatar: 'https://i.pravatar.cc/150?u=nostrdev' },
  { name: 'pleb21', avatar: 'https://i.pravatar.cc/150?u=pleb21' },
  { name: 'stackingsats', avatar: 'https://i.pravatar.cc/150?u=stacking' },
  { name: 'zap_queen', avatar: 'https://i.pravatar.cc/150?u=zapqueen' },
  { name: 'bitcoin_maxi', avatar: 'https://i.pravatar.cc/150?u=maxi' },
  { name: 'freedom_tech', avatar: 'https://i.pravatar.cc/150?u=freedom' },
]

// Slot configuration - top zone only, keeping center and bottom free
const ALL_SLOTS = [1, 5, 9, 13, 17, 21] // top zone (6 slots)
const NUM_SLOTS = ALL_SLOTS.length

// Demo lorem ipsum phrases
const DEMO_COMMENTS = [
  // English
  'lol',
  'wwwwww',
  'nice!',
  'haha',
  'this is amazing',
  'so cool',
  'wait what',
  'no way',
  'lmaooo',
  'based',
  'kek',
  'bruh moment',
  'yooo',
  'fire',
  'lets gooo',
  'real',
  'facts',
  'omg',
  'incredible',
  'GOAT',
  'W',
  'banger',
  'sheesh',
  'too good',
  'holy',
  'insane',
  // With emojis
  '🔥🔥🔥',
  '😂😂😂',
  '❤️',
  '👀',
  '💀💀💀',
  '🙌',
  '😭😭',
  '🤯',
  '👏👏👏',
  '⚡️',
  'lmao 😂',
  'so good 🔥',
  'W 🏆',
  'bruh 💀',
  'ngl this slaps 🎵',
  '10/10 ⭐',
  'legend 👑',
  // Japanese
  'すごい！',
  'かわいい',
  'やばい',
  '草',
  'www',
  'ワロタ',
  'なにこれ',
  'うまい',
  '神',
  'えええ',
  'うそでしょ',
  '最高',
  'かっこいい',
  'おもしろい',
  'すげー',
  'マジで？',
  'ナイス',
  // Chinese
  '哈哈哈',
  '太厉害了',
  '牛逼',
  '666',
  '好看',
  '加油',
  '厉害',
  '卧槽',
  '太棒了',
  '笑死',
  '绝了',
  '真的吗',
  '这也太强了',
  '爱了爱了',
  '神仙',
  '太好看了',
  '前排',
  // Longer comments
  'I cant believe what I just watched',
  'this is the best thing ive seen all week',
  'why is nobody talking about this',
  'came here from twitter and was not disappointed',
  'the algorithm finally got it right',
  'watching this for the third time today',
  'my jaw is on the floor rn',
  'how does this not have more views',
  'this deserves way more attention fr fr',
  'bro really did that with no hesitation 💀',
  'the way I screamed when this happened',
  'okay but can we talk about how insane this is',
  'sending this to everyone I know',
  'this is peak content right here',
  'never clicked on a video so fast in my life',
  // Longer Japanese
  'これマジでやばすぎる',
  'なんでこんなに上手いの',
  '見てるこっちが恥ずかしくなる',
  ' 何回見ても飽きない',
  '鳥肌立った',
  // Longer Chinese
  '这个视频我能看一百遍',
  '笑到停不下来',
  '这是什么神仙操作',
  '每次看都有新发现',
  '已经分享给所有朋友了',
  // German
  'geil',
  'krass',
  'nice',
  'haha',
  'was geht',
  'alter',
  'mega',
  'läuft',
  'ehrenmann',
  'wild',
  'digga',
  'heftig',
  'zu gut',
  'wahnsinn',
  'echt jetzt?',
  // Longer German
  'das ist so gut ich kann nicht mehr',
  'warum kenne ich das erst jetzt',
  'ich bin tot 💀',
  'hab das schon 10 mal geguckt',
  'bester content den ich je gesehen hab',
  // Spanish
  'jaja',
  'qué',
  'buenísimo',
  'genial',
  'increíble',
  'no manches',
  'guau',
  'épico',
  'brutal',
  'crack',
  'tremendo',
  'top',
  'madre mía',
  'ostras',
  'flipando',
  // Longer Spanish
  'esto es lo mejor que he visto hoy',
  'no puedo dejar de verlo',
  'me muero de risa 😂',
  'cómo es que esto no tiene más vistas',
  'ya lo compartí con todos mis amigos',
  // More English
  'goated',
  'legendary',
  'W take',
  'valid',
  'slay',
  'rent free',
  'its giving',
  'ate that',
  'period',
  'no cap',
  'lowkey fire',
  'highkey slaps',
  'straight up',
  'vibes',
  'mood',
  'same',
  'relatable',
  'felt that',
  'big facts',
  'truee',
  'deadass',
  'bet',
  'say less',
  'iykyk',
  'nah fr',
  // More emojis
  '🤣🤣🤣',
  '😍😍',
  '🥺',
  '💯💯',
  '🙏🙏',
  '👌👌',
  '😮',
  '🤩',
  '💪💪',
  '❤️‍🔥',
  '🫡',
  '🗣️',
  '📈📈',
  '✨✨✨',
  '🎯',
  'goat 🐐',
  'clean 🧼',
  'king 👑',
  'queen 👸',
  'chef kiss 🤌',
  // More Japanese
  'ええやん',
  'まじか',
  'わかる',
  'それな',
  '天才',
  'プロ',
  'えぐい',
  'ヤバイ',
  '尊い',
  '推せる',
  'わろた',
  'ｗｗｗ',
  '草生える',
  'ないわー',
  'まって',
  'きたー',
  '888888',
  '素晴らしい',
  '感動した',
  'なるほど',
  // More Chinese
  '哈哈哈哈哈',
  '太强了',
  '绝绝子',
  '笑不活了',
  '泪目',
  '破防了',
  'yyds',
  '无敌',
  '秀啊',
  '细节',
  '太真实了',
  '就离谱',
  '好家伙',
  '我裂开了',
  '芜湖',
  '冲冲冲',
  '支持',
  '来了来了',
  '第一次见',
  '看了好多遍',
  // More German
  'hammer',
  'stark',
  'uff',
  'bruder',
  'junge',
  'same',
  'voll',
  'richtiger ehrenmann',
  'absolut',
  'respekt',
  'wie geil ist das denn',
  'einfach nur wow',
  'ohne worte',
  'das kickt',
  'straight fire',
  'krank',
  'hart',
  'safe',
  'true',
  'vallah',
  // More Spanish
  'dios mío',
  'qué pasada',
  'brutal',
  'bestial',
  'tope',
  'guapo',
  'mola',
  'flipa',
  'pasote',
  'ole',
  'vamos',
  'eso',
  'locura',
  'de locos',
  'que fuerte',
  'no me lo creo',
  'increible',
  'hermano',
  'pana',
  'capo',
  // More longer comments
  'this is why I love the internet',
  'im literally crying right now',
  'how is this so underrated',
  'the talent jumped out',
  'this hits different at 3am',
  'living rent free in my head',
  'this is my new favorite thing',
  'ive watched this 50 times no joke',
  'the vibes are immaculate',
  'whoever made this deserves everything',
  // More longer Japanese
  '最初から最後まで最高だった',
  'もう何回見たかわからない',
  'これは神回',
  '涙が止まらない',
  'センスの塊',
  // More longer Chinese
  '我已经循环播放了',
  '这就是我要的',
  '太有才了',
  '这波操作我给满分',
  '评论区人才辈出',
  // More longer German
  'das ist einfach nur genial',
  'ich kann nicht aufhören zu lachen',
  'wie kann man so gut sein',
  'meine erwartungen wurden übertroffen',
  'das muss man gesehen haben',
  // More longer Spanish
  'esto es arte puro',
  'no tengo palabras',
  'necesito más de esto',
  'que alguien me explique cómo',
  'esto merece un premio',
  // Even more English
  'underrated',
  'overrated',
  'classic',
  'masterpiece',
  'elite',
  'premium',
  'certified',
  'approved',
  'valid take',
  'hard agree',
  'disagree',
  'cope',
  'seethe',
  'ratio',
  'L + ratio',
  'W + valid',
  'mid',
  'peak',
  'goated with the sauce',
  'built different',
  'hits different',
  'aint no way',
  'no shot',
  'literally me',
  'core memory unlocked',
  'nostalgia hitting hard',
  'felt this in my soul',
  'this awakened something',
  'im deceased',
  'im weak',
  'im done',
  'im screaming',
  'crying in the club rn',
  'sobbing',
  'shaking and crying',
  'throwing up',
  'passed away',
  'ascended',
  'transcended',
  'enlightened',
  'blessed',
  'cursed',
  'blursed',
  'chaotic energy',
  'main character energy',
  'villain arc',
  'redemption arc',
  'plot twist',
  'unexpected',
  'called it',
  'saw that coming',
  'didnt see that coming',
  'what a twist',
  'poetic',
  'cinema',
  'art',
  'perfection',
  'flawless',
  'immaculate',
  // Even more emojis
  '💀',
  '😭',
  '🔥',
  '💯',
  '🙏',
  '👑',
  '🐐',
  '⚡',
  '✨',
  '🎯',
  '🤝',
  '🫶',
  '😤',
  '🥹',
  '🤧',
  '😳',
  '🫠',
  '💅',
  '🤌',
  '👁️👄👁️',
  'bruh 😭',
  'help 💀',
  'crying 😂',
  'screaming 🗣️',
  'literally 😭😭',
  'bestie 🥺',
  'period 💅',
  'slay 💁‍♀️',
  'its the ___ for me 😭',
  'not the 💀',
  // Even more Japanese
  'ほんとそれ',
  'めっちゃわかる',
  'ありがとう',
  'おめでとう',
  'お疲れ様',
  'がんばれ',
  '頑張って',
  '応援してる',
  '好き',
  '大好き',
  '愛してる',
  'かわいすぎ',
  'やばすぎ',
  'すごすぎ',
  '神すぎ',
  'センスいい',
  '才能',
  'プロすぎ',
  '上手すぎ',
  '完璧',
  '最強',
  '無敵',
  'レジェンド',
  'チャンピオン',
  'キング',
  'クイーン',
  'ヒーロー',
  '伝説',
  '殿堂入り',
  '歴史に残る',
  // Even more Chinese
  '太牛了',
  '真牛',
  '牛啊',
  '强啊',
  '秀',
  '666666',
  '厉害厉害',
  '好棒',
  '真棒',
  '太好了',
  '开心',
  '感动',
  '泪目了',
  '哭了',
  '笑哭',
  '笑死我了',
  '好搞笑',
  '太有趣了',
  '有意思',
  '喜欢',
  '爱了',
  '心动了',
  '种草了',
  '收藏了',
  '关注了',
  '投币了',
  '三连了',
  '一键三连',
  '必须三连',
  '支持支持',
  // Even more German
  'boah',
  'wow',
  'ey',
  'jo',
  'ach',
  'nee',
  'doch',
  'oha',
  'omg',
  'wtf',
  'lol',
  'rofl',
  'hahaha',
  'hihi',
  'höhö',
  'ganz stark',
  'sehr nice',
  'mega krass',
  'voll gut',
  'richtig gut',
  'einfach gut',
  'zu krass',
  'der hammer',
  'der wahnsinn',
  'genial einfach',
  'einfach genial',
  'unfassbar',
  'unglaublich',
  'der absolute wahnsinn',
  'das ist ja mal was',
  // Even more Spanish
  'wow',
  'guay',
  'chulo',
  'majo',
  'mono',
  'curioso',
  'interesante',
  'divertido',
  'gracioso',
  'chistoso',
  'loco',
  'alucinante',
  'espectacular',
  'maravilloso',
  'fantástico',
  'fenomenal',
  'estupendo',
  'excelente',
  'perfecto',
  'ideal',
  'divino',
  'precioso',
  'bonito',
  'hermoso',
  'bello',
  'sublime',
  'glorioso',
  'magnífico',
  'extraordinario',
  'impresionante',
  // Even more longer comments
  'okay hear me out',
  'no because actually',
  'wait let me explain',
  'hold on a minute',
  'excuse me what',
  'i have no words',
  'words cannot describe',
  'this changed my life',
  'this cured my depression',
  'i needed this today',
  'thank you for this',
  'bless whoever made this',
  'the person who made this understood the assignment',
  'they really said lets break the internet',
  'this is what peak performance looks like',
  'we are witnessing history',
  'future generations will study this',
  'put this in a museum',
  'frame this and hang it',
  'this belongs in the louvre',
  // Even more longer Japanese
  'これを待ってた',
  '期待以上だった',
  '想像を超えてきた',
  '予想外すぎる',
  '衝撃的すぎる',
  '感情が追いつかない',
  '言葉が出ない',
  '涙が止まらない',
  '笑いが止まらない',
  '何度見ても最高',
  // Even more longer Chinese
  '这就是我想要的',
  '终于等到你',
  '不负期待',
  '超出预期',
  '震惊我全家',
  '我直接裂开',
  'DNA动了',
  '血压飙升',
  '心跳加速',
  '瞳孔地震',
  // Even more longer German
  'das ist der wahnsinn',
  'ich kann es nicht fassen',
  'das hat mich umgehauen',
  'bin sprachlos',
  'keine worte mehr',
  'das beste was ich je gesehen habe',
  'absolute spitzenklasse',
  'weltklasse niveau',
  'olympia reif',
  'das ist kunst',
  // Even more longer Spanish
  'esto es increíble de verdad',
  'no me lo esperaba para nada',
  'me ha dejado sin palabras',
  'estoy flipando en colores',
  'esto es otro nivel',
  'de lo mejor que he visto',
  'contenido de calidad',
  'esto sí que es arte',
  'merecido todos los premios',
  'esto es historia',
]

interface BulletCommentsProps {
  isPlaying?: boolean
  currentTime?: number
  videoDuration?: number // total video duration in seconds
}

// Generate random scheduled comments for a video
function generateScheduledComments(videoDuration: number, count: number): ScheduledComment[] {
  const comments: ScheduledComment[] = []
  const now = Date.now()

  for (let i = 0; i < count; i++) {
    const owner = DEMO_USERS[Math.floor(Math.random() * DEMO_USERS.length)]
    // Random zap amount 1-221 sats
    const zapAmount = Math.floor(1 + Math.random() * 221)

    comments.push({
      id: i,
      text: DEMO_COMMENTS[Math.floor(Math.random() * DEMO_COMMENTS.length)],
      videoTime: Math.random() * videoDuration, // random timestamp in video
      ownerName: owner.name,
      ownerAvatar: owner.avatar,
      postedAt: new Date(now - Math.random() * 7 * 24 * 60 * 60 * 1000),
      zapAmount,
    })
  }

  // Sort by video timestamp for efficient processing
  return comments.sort((a, b) => a.videoTime - b.videoTime)
}

// Memoized individual comment component to prevent unnecessary re-renders
const BulletCommentItem = memo(function BulletCommentItem({
  comment,
  isPaused,
}: {
  comment: BulletComment
  isPaused: boolean
}) {
  return (
    <div
      className={`absolute whitespace-nowrap text-white/80 font-light text-2xl bullet-comment cursor-default pointer-events-auto group z-10 hover:z-50 ${isPaused ? 'paused' : ''}`}
      style={{
        top: `${ALL_SLOTS[comment.slot]}%`,
        left: '100%',
        animationDuration: `${comment.duration}s`,
        textShadow: `-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000`,
        contain: 'layout style',
      }}
    >
      {comment.text}
      {/* Tooltip on hover */}
      <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-[100]">
        <div className="bg-black/90 backdrop-blur-sm rounded-lg px-4 py-3 shadow-lg border border-white/10 min-w-[200px]">
          <div className="flex items-center gap-3">
            <img
              src={comment.ownerAvatar}
              alt={comment.ownerName}
              className="w-10 h-10 rounded-full flex-shrink-0"
            />
            <div className="flex flex-col min-w-0">
              <span className="text-white text-sm font-semibold truncate">{comment.ownerName}</span>
              <span className="text-white/60 text-xs whitespace-nowrap">
                {formatDistanceToNow(comment.postedAt, { addSuffix: true })}
              </span>
            </div>
            <div className="flex items-center gap-1 ml-auto bg-yellow-500/20 px-2 py-1 rounded-full flex-shrink-0">
              <span className="text-yellow-400">⚡</span>
              <span className="text-yellow-400 text-sm font-medium whitespace-nowrap">
                {comment.zapAmount.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

export function BulletComments({
  isPlaying = true,
  currentTime = 0,
  videoDuration = 600, // default 10 minutes
}: BulletCommentsProps) {
  const [comments, setComments] = useState<BulletComment[]>([])
  const cleanupIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Track when each slot becomes available (timestamp when a new comment can use it)
  const slotAvailableAtRef = useRef<number[]>(new Array(NUM_SLOTS).fill(0))
  // Pre-generated scheduled comments
  const scheduledCommentsRef = useRef<ScheduledComment[]>([])
  // Track which scheduled comments have been shown
  const shownIdsRef = useRef<Set<number>>(new Set())
  // Track last processed video time (for seek detection)
  const lastVideoTimeRef = useRef<number>(0)
  // Next comment ID for active comments
  const nextIdRef = useRef(0)

  // Generate scheduled comments on mount or when duration changes
  useEffect(() => {
    // Generate 200 comments per minute of video
    const commentCount = Math.max(100, Math.floor((videoDuration / 60) * 200))
    scheduledCommentsRef.current = generateScheduledComments(videoDuration, commentCount)
    shownIdsRef.current.clear()
    lastVideoTimeRef.current = 0
    // Defer state update to avoid cascading renders
    queueMicrotask(() => setComments([]))
  }, [videoDuration])

  // Clean up expired comments
  const cleanupExpiredComments = useCallback(() => {
    const now = Date.now()
    setComments(prev => {
      const filtered = prev.filter(c => c.expiresAt > now)
      return filtered.length === prev.length ? prev : filtered
    })
  }, [])

  // Add a scheduled comment to active comments
  const addComment = useCallback((scheduled: ScheduledComment) => {
    const now = Date.now()

    // Find available slot
    const availableSlots: number[] = []
    for (let i = 0; i < NUM_SLOTS; i++) {
      if (now >= slotAvailableAtRef.current[i]) {
        availableSlots.push(i)
      }
    }

    // Skip if no slots available
    if (availableSlots.length === 0) return

    const slot = availableSlots[0]
    const duration = 10 + Math.random() * 6

    // Mark slot as occupied
    const textLengthFactor = Math.min(scheduled.text.length / 20, 1)
    const slotOccupiedTime = (2 + textLengthFactor * 3) * 1000
    slotAvailableAtRef.current[slot] = now + slotOccupiedTime

    const newComment: BulletComment = {
      id: nextIdRef.current++,
      text: scheduled.text,
      slot,
      duration,
      expiresAt: now + duration * 1000,
      ownerName: scheduled.ownerName,
      ownerAvatar: scheduled.ownerAvatar,
      postedAt: scheduled.postedAt,
      zapAmount: scheduled.zapAmount,
    }

    setComments(prev => [...prev, newComment])
  }, [])

  // Process scheduled comments based on currentTime
  useEffect(() => {
    if (!isPlaying) return

    const scheduled = scheduledCommentsRef.current
    const lastTime = lastVideoTimeRef.current

    // Detect seek (jumped backward or forward by more than 2 seconds)
    const seeked = Math.abs(currentTime - lastTime) > 2

    if (seeked) {
      // Reset shown IDs for times after current position
      shownIdsRef.current = new Set(
        [...shownIdsRef.current].filter(id => {
          const comment = scheduled.find(c => c.id === id)
          return comment && comment.videoTime < currentTime
        })
      )
      // Clear active comments on seek (defer to avoid cascading renders)
      queueMicrotask(() => setComments([]))
      // Reset slot availability
      slotAvailableAtRef.current = new Array(NUM_SLOTS).fill(0)
    }

    // Find comments that should appear between lastTime and currentTime
    for (const comment of scheduled) {
      // Skip already shown
      if (shownIdsRef.current.has(comment.id)) continue

      // Check if this comment should appear now
      if (comment.videoTime >= lastTime && comment.videoTime <= currentTime) {
        shownIdsRef.current.add(comment.id)
        addComment(comment)
      }

      // Stop checking once we're past currentTime (list is sorted)
      if (comment.videoTime > currentTime) break
    }

    lastVideoTimeRef.current = currentTime
  }, [currentTime, isPlaying, addComment])

  // Single cleanup interval for all expired comments
  useEffect(() => {
    cleanupIntervalRef.current = setInterval(cleanupExpiredComments, 1000)

    return () => {
      if (cleanupIntervalRef.current) {
        clearInterval(cleanupIntervalRef.current)
        cleanupIntervalRef.current = null
      }
    }
  }, [cleanupExpiredComments])

  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none"
      style={{ contain: 'strict' }}
    >
      {comments.map(comment => (
        <BulletCommentItem key={comment.id} comment={comment} isPaused={!isPlaying} />
      ))}

      <style>{`
        @keyframes bullet-fly {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(calc(-100vw - 100%));
          }
        }
        .bullet-comment {
          animation: bullet-fly linear forwards;
          will-change: transform;
        }
        .bullet-comment:hover,
        .bullet-comment.paused {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  )
}
