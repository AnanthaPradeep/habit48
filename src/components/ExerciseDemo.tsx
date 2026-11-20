import { useEffect, useRef, useState } from 'react'
import { Play, Pause } from 'lucide-react'
import type { Exercise } from '../domain/exercises'

// Each frame tracks head, shoulder, hip, and the two knee/foot and elbow/hand pairs.
type Point = [number, number]
const frame = (value: string): Point[] => value.split(' ').map(pair => pair.split(',').map(Number) as Point)
const tall = '98,28 98,49 98,94 93,125 93,157 87,73 87,97 105,125 109,157 108,73 109,98'
const squat = '113,56 106,76 82,110 113,126 97,157 122,91 139,86 100,130 82,157 113,93 129,93'
const floor = '57,146 74,149 111,151 136,120 153,157 89,154 111,156 132,125 146,157 87,145 108,149'
const quadruped = '60,85 76,98 119,99 121,139 149,156 74,125 73,157 132,137 157,153 81,123 84,154'
const lean = '131,55 115,67 76,97 88,126 91,157 113,101 117,126 78,128 80,157 105,98 107,123'
const lunge = '100,47 101,68 98,111 119,124 116,157 90,94 101,104 75,143 59,156 113,91 125,101'
const framePairs: Record<string, [string, string]> = {
  squat: [tall,squat],
  goblet: [tall.replace('87,73 87,97','90,72 103,54'),squat.replace('122,91 139,86','116,93 119,72')],
  wall: ['108,37 102,57 91,97 82,126 71,157 126,60 149,57 89,125 77,157 128,66 149,62','135,45 126,66 105,101 91,125 71,157 124,85 149,57 98,128 77,157 120,88 149,62'],
  incline: ['121,57 105,72 80,104 64,128 48,157 127,92 147,111 70,130 55,157 122,94 144,113','136,89 121,103 92,122 70,138 48,157 108,120 147,111 76,137 55,157 115,124 144,113'],
  lunge: [tall,lunge],
  'loaded-lunge': [tall,lunge.replace('90,94 101,104','91,91 91,116').replace('113,91 125,101','111,92 111,119')],
  bridge: [floor,'57,146 74,149 111,121 136,120 153,157 89,154 111,156 131,125 146,157 87,145 108,149'],
  bird: [quadruped,'61,84 77,98 118,98 144,96 169,94 52,100 30,100 126,136 155,156 76,125 79,157'],
  dead: ['57,146 74,149 112,152 114,117 147,116 75,121 75,97 105,119 136,116 82,122 82,99','57,146 74,149 112,152 136,152 163,149 55,151 31,149 105,119 136,116 82,122 82,99'],
  march: [tall,'98,28 98,49 98,94 121,104 122,131 85,72 95,62 103,126 106,157 111,75 107,95'],
  carry: [tall,'98,28 98,49 98,94 110,122 121,149 87,73 87,97 92,126 77,157 108,73 109,98'],
  calf: [tall,'98,22 98,43 98,88 93,120 96,151 87,67 87,91 105,120 112,151 108,67 109,92'],
  side: [tall,'98,28 98,49 98,94 73,119 53,141 79,64 62,66 105,125 109,157 108,73 109,98'],
  step: [tall,'109,28 109,49 110,94 91,125 79,157 95,73 90,96 127,125 138,157 123,73 129,96'],
  heel: [tall,'98,28 98,49 98,94 105,119 130,154 86,73 83,95 92,126 89,157 110,73 114,94'],
  slide: ['98,28 98,49 98,94 93,125 93,157 72,59 70,35 105,125 109,157 124,59 126,35','98,28 98,49 98,94 93,125 93,157 78,31 76,11 105,125 109,157 118,31 121,11'],
  roll: [tall,tall.replace('98,49','101,44').replace('87,73','90,66').replace('108,73','111,66')],
  circle: ['98,28 98,49 98,94 93,125 93,157 72,49 50,48 105,125 109,157 124,49 146,48','98,28 98,49 98,94 93,125 93,157 73,42 52,32 105,125 109,157 123,42 145,32'],
  open: ['98,28 98,49 98,94 93,125 93,157 77,63 92,54 105,125 109,157 119,63 104,54','98,28 98,49 98,94 93,125 93,157 70,63 53,46 105,125 109,157 126,63 143,46'],
  cross: [tall,'98,28 98,49 98,94 93,125 93,157 113,62 134,61 105,125 109,157 121,71 100,57'],
  hinge: [tall,lean],
  tilt: [floor,floor.replace('111,151','111,147')],
  cat: [quadruped,quadruped.replace('60,85 76,98 119,99','65,100 77,86 119,91')],
  'heel-slide': [floor,floor.replace('136,120 153,157','144,150 166,157')],
  prone: ['56,147 74,150 111,152 139,154 165,156 80,146 67,143 139,157 163,159 94,151 83,151','56,143 74,147 111,152 139,154 165,156 88,138 69,131 139,157 163,159 92,145 84,138'],
  reach: [tall,'84,30 88,51 101,94 96,125 96,157 69,65 65,88 108,125 112,157 97,29 83,11'],
  ankle: [tall,lunge.replace('100,47 101,68 98,111','110,32 105,53 98,94')],
  clam: [floor,floor.replace('136,120','132,100')],
  toe: [tall,tall.replace('93,157','88,155').replace('109,157','104,155')],
  curl: [tall,tall.replace('87,97','84,54').replace('109,98','112,55')],
  press: [floor.replace('89,154 111,156','88,147 88,126').replace('87,145 108,149','83,142 83,123'),
    floor.replace('89,154 111,156','76,121 76,96').replace('87,145 108,149','85,123 85,100')],
  row: [lean,lean.replace('113,101 117,126','89,83 109,95').replace('105,98 107,123','83,84 104,95')],
  overhead: ['98,28 98,49 98,94 93,125 93,157 73,63 73,42 105,125 109,157 123,63 123,42',
    '98,28 98,49 98,94 93,125 93,157 83,32 83,11 105,125 109,157 113,32 113,11'],
}

function paintTrainer(context: CanvasRenderingContext2D, points: Point[], exercise: Exercise, facing: number, frontView: boolean) {
  const [head, shoulder, hip, frontKnee, frontFoot, frontElbow, frontHand, backKnee, backFoot, backElbow, backHand] = points
  const between = ([x, y]: Point, [a, b]: Point, amount: number): Point => [x + (a - x) * amount, y + (b - y) * amount]
  const offset = (point: Point, x: number, y: number): Point => [point[0] + x, point[1] + y]
  const length = Math.hypot(hip[0] - shoulder[0], hip[1] - shoulder[1]) || 1
  const side: Point = [(hip[1] - shoulder[1]) / length, (shoulder[0] - hip[0]) / length]
  const sideways = (point: Point, distance: number) => offset(point, side[0] * distance, side[1] * distance)
  const width = frontView ? 13 : 9
  const skin = '#b87654'
  const shadow = '#8f563f'

  function stroke(path: Point[], color: string, size: number) {
    context.beginPath()
    context.moveTo(...path[0])
    path.slice(1).forEach(point => context.lineTo(...point))
    context.strokeStyle = color
    context.lineWidth = size
    context.stroke()
  }
  function ellipse(point: Point, xRadius: number, yRadius: number, color: string) {
    context.beginPath()
    context.ellipse(...point, xRadius, yRadius, 0, 0, Math.PI * 2)
    context.fillStyle = color
    context.fill()
  }
  function polygon(points: Point[], color: string | CanvasGradient) {
    context.beginPath()
    context.moveTo(...points[0])
    points.slice(1).forEach(point => context.lineTo(...point))
    context.closePath()
    context.fillStyle = color
    context.fill()
  }
  function leg(knee: Point, foot: Point, near: boolean) {
    const start = sideways(hip, near ? 3.5 : -3.5)
    stroke([start, knee], near ? skin : shadow, near ? 11 : 9)
    stroke([knee, foot], near ? skin : shadow, near ? 8 : 7)
    stroke([start, between(start, knee, .55)], near ? '#26353c' : '#202a30', near ? 13 : 11)
    const toe = offset(foot, 7 * facing, 0)
    stroke([offset(foot, -2 * facing, 2.5), offset(toe, 0, 2.5)], '#fbf9ed', 3.5)
    stroke([foot, toe], near ? '#485455' : '#354141', 5)
    stroke([between(foot, toe, .25), between(foot, toe, .6)], '#dce9a7', 1.25)
  }
  function arm(elbow: Point, hand: Point, near: boolean) {
    const start = sideways(shoulder, near ? -width + 2 : width - 2)
    stroke([start, elbow], near ? skin : shadow, near ? 8 : 6.5)
    stroke([elbow, hand], near ? skin : shadow, near ? 6.5 : 5.5)
    stroke([start, between(start, elbow, .28)], near ? '#247055' : '#154736', 10)
    ellipse(hand, 3.5, 3.8, near ? skin : shadow)
  }
  function dumbbell(hand: Point) {
    stroke([offset(hand, -9, 0), offset(hand, 9, 0)], '#46444b', 2)
    for (const side of [-1, 1]) {
      stroke([offset(hand, side * 8, -3), offset(hand, side * 8, 3)], '#354345', 5)
    }
  }

  context.lineCap = 'round'
  context.lineJoin = 'round'
  ellipse([98, 162], 72, 3, '#174b3719')
  if (exercise.pose === 'wall' || exercise.pose === 'incline') {
    const y = exercise.pose === 'wall' ? 20 : 111
    stroke([[150, y], [150, 161]], '#759479', 4)
    if (exercise.pose === 'incline') stroke([[145, y], [176, y]], '#759479', 4)
  }
  leg(backKnee, backFoot, false)
  arm(backElbow, backHand, false)
  if (exercise.weights === 2) dumbbell(backHand)
  leg(frontKnee, frontFoot, true)

  stroke([head, shoulder], shadow, 7)
  const shirt = context.createLinearGradient(...sideways(shoulder, width), ...sideways(shoulder, -width))
  shirt.addColorStop(0, '#154736')
  shirt.addColorStop(.65, '#28795b')
  shirt.addColorStop(1, '#328869')
  polygon([sideways(shoulder, width), sideways(shoulder, -width),
    sideways(hip, -8), sideways(hip, 8)], shirt)
  stroke([sideways(hip, -7), sideways(hip, 7)], '#164735', 2)
  const chest = between(shoulder, hip, .3)
  stroke([sideways(chest, -4), sideways(chest, -1)], '#dce9a7', 1.4)
  arm(frontElbow, frontHand, true)
  if (exercise.weights > 0) dumbbell(frontHand)

  context.save()
  context.translate(...head)
  context.scale(facing, 1)
  ellipse([0, 1], 8, 10, skin)
  ellipse([-6.8, 1.3], 2, 2.7, skin)
  polygon([[-7, -1], [-8, -6], [-5, -10], [1, -11], [7, -8], [8, -4], [2, -6], [-3, -3]], '#292826')
  if (!frontView) polygon([[6, -1], [10, 2], [7, 3]], skin)
  const chin: Point = frontView ? [0, 7] : [3, 7]
  stroke([offset(chin, -4, -1), chin, offset(chin, 4, -2)], '#583b32', 2.4)
  ellipse(frontView ? [-3, 0] : [4, 0], .85, .7, '#2b2725')
  if (frontView) ellipse([3, 0], .85, .7, '#2b2725')
  context.restore()
}

export function ExerciseDemo({ exercise, thumbnail = false }: { exercise: Exercise; thumbnail?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    const context = canvas.current?.getContext('2d')
    if (!context) return
    const [from, to] = (framePairs[exercise.pose] ?? [tall, tall]).map(frame)
    const facing = to[0][0] < to[1][0] - 2 ? -1 : 1
    const frontView = Math.abs(to[0][0] - to[1][0]) < 3 && Math.abs(to[2][0] - to[1][0]) < 8
    let request = 0
    const start = performance.now()
    function draw(time: number) {
      if (!context) return
      const amount = playing ? (1 - Math.cos((time - start) / 420)) / 2 : .77
      const points = from.map(([x,y], i): Point => [x + (to[i][0] - x) * amount, y + (to[i][1] - y) * amount])
      context.clearRect(0, 0, 196, 175)
      paintTrainer(context, points, exercise, facing, frontView)
      if (playing) request = requestAnimationFrame(draw)
    }
    draw(start)
    return () => cancelAnimationFrame(request)
  }, [exercise, playing])
  return <div className={thumbnail ? 'exercise-art exercise-thumb' : 'exercise-art'}>
    <canvas ref={canvas} width={196} height={175} role={thumbnail ? undefined : 'img'}
      aria-hidden={thumbnail || undefined} aria-label={thumbnail ? undefined : exercise.name + ' form animation'} />
    {!thumbnail && <button type="button" className="quiet-button demo-toggle" onClick={() => setPlaying(value => !value)}>
      {playing ? <Pause size={16} /> : <Play size={16} />} {playing ? 'Pause demo' : 'Play demo'}
    </button>}
  </div>
}
