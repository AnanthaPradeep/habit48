const ace = 'https://www.acefitness.org/resources/everyone/exercise-library/'
const nhs = 'https://www.nhs.uk/live-well/exercise/strength-and-flex-exercise-plan-how-to-videos/'
type Group = 'Chest' | 'Back' | 'Shoulders' | 'Arms' | 'Legs' | 'Glutes' | 'Core' | 'Calves' | 'Cardio' | 'Mobility' | 'Stretching'
type Movement = [string, string, Group, string, string, string, string, string, number?]

// Original wording. Linked sources provide additional form guidance.
const bodyweight: Movement[] = [
  ['squat','Bodyweight squat','Legs','squat','Sit back and down, keeping your whole foot planted. Stand tall.','Breathe out as you stand.','Avoid inward knee collapse.','Use a shallow range or sit to stand.',12],
  ['wall-push','Wall push-up','Chest','wall','Place palms on a wall at chest height. Bend your elbows and press away as one unit.','Inhale toward the wall; exhale as you press.','Avoid jutting your chin or arching your back.','Stand closer to the wall.'],
  ['incline-push','Incline push-up','Chest','incline','Use a sturdy counter. Keep your body straight as you bring your chest toward it.','Breathe out as you press.','Avoid low hips and unstable furniture.','Use a wall push-up.'],
  ['reverse-lunge','Reverse lunge','Legs','lunge','Step one foot back, bend both knees comfortably, then push through the front foot. Alternate sides.','Breathe out as you return to standing.','Keep the front knee tracking over the foot.','Hold a wall and take a shorter step.',8],
  ['bridge','Glute bridge','Glutes','bridge','Lie on your back with feet planted. Lift your hips, then lower with control.','Breathe out as your hips rise.','Avoid lifting by arching your lower back.','Lift your hips only a little.'],
  ['bird-dog','Bird dog','Core','bird','From hands and knees, reach opposite arm and leg out without rotating. Switch sides.','Breathe out as you reach.','Keep your head in line with your spine.','Move just one limb at a time.',6],
  ['dead-bug','Dead bug','Core','dead','Lie with knees above hips and arms up. Lower one heel and the opposite arm, then switch.','Breathe out as the limbs move away.','Avoid letting your lower back lift.','Keep your arms still and tap one heel.',6],
  ['knee-raise','Standing knee raises','Core','march','Stand tall and lift one knee toward hip height. Lower it and switch sides.','Breathe out as the knee rises.','Avoid leaning back or bouncing.','Lift lower and hold a wall.',10],
  ['calf','Calf raises','Calves','calf','Stand near a wall, lift both heels, then lower slowly.','Breathe out as your heels rise.','Avoid rolling outward on your ankles.','Use a smaller lift with wall support.',12],
  ['march','Marching in place','Cardio','march','Alternate gentle knee lifts with relaxed arm swings. Stay tall.','Breathe steadily at a conversational pace.','Avoid stamping or rushing.','Use a slower march, or march seated.',30],
  ['sit-stand','Sit to stand','Legs','squat','Use a stable chair. Lean slightly forward, stand, then sit down softly.','Breathe out as you stand.','Avoid dropping into the seat.','Use a higher stable chair or use your hands.'],
  ['side-leg','Standing hip abduction','Glutes','side','With wall support, lift one straight leg sideways. Return and switch.','Breathe out as the leg lifts.','Keep your toes forward and avoid leaning.','Use a smaller range.',8],
  ['step-touch','Step touch','Cardio','step','Step sideways, tap the other foot in, and repeat in the other direction.','Breathe naturally throughout.','Keep steps gentle and your knees soft.','Tap in place without the side step.',30],
  ['heel-dig','Heel digs','Cardio','heel','Tap one heel in front with toes lifted. Bring it back and alternate.','Breathe steadily throughout.','Avoid locking the supporting knee.','Shorten the reach.',30],
  ['wall-slide','Wall slides','Shoulders','slide','With your back near a wall, slide bent arms upward within an easy range.','Exhale on the upward slide.','Avoid shrugging or flaring your ribs.','Slide only a few inches.',8],
  ['shoulder-roll','Shoulder rolls','Mobility','roll','Lift shoulders gently, circle back and down. Keep arms relaxed.','Keep breathing as your shoulders move.','Do not roll your head with your shoulders.','Make the circles smaller.',8],
  ['arm-circle','Arm circles','Shoulders','circle','Reach arms outward and draw small circles. Change direction halfway.','Breathe slowly and evenly.','Avoid large or fast swings.','Bend your elbows or lower your arms.',8],
  ['chest-open','Standing chest opener','Stretching','open','Open bent arms gently to the sides and bring them back together.','Inhale as you open; exhale as you return.','Avoid arching your lower back.','Keep elbows below shoulder height.',8],
  ['cross-stretch','Cross-body shoulder stretch','Stretching','cross','Bring one arm across your chest and support it above the elbow with the other arm.','Breathe slowly as you hold.','Avoid pulling on the elbow or hiking the shoulder.','Bring the arm only partway across.',20],
  ['calf-stretch','Wall calf stretch','Stretching','lunge','Step one foot back, point toes forward and keep the back heel down. Switch sides.','Breathe evenly during the hold.','Avoid bouncing or turning the back foot outward.','Bring the back foot closer.',20],
  ['hip-hinge','Hip hinge','Legs','hinge','Soften your knees and send your hips back, keeping your spine long. Stand tall.','Inhale as you hinge; exhale as you stand.','Avoid rounding your back or turning it into a deep squat.','Use a shallower hinge.'],
  ['pelvic-tilt','Pelvic tilt','Mobility','tilt','Lie on your back with knees bent. Gently flatten your lower back, then release.','Breathe out during the tilt.','Do not press forcefully into the floor.','Make the tilt smaller.',8],
  ['cat-cow','Cat–cow','Mobility','cat','On hands and knees, alternate a gentle back rounding with a comfortable extension.','Exhale as you round; inhale as you release.','Avoid forcing the neck or low back.','Move through a smaller range.',6],
  ['heel-slide','Heel slide','Core','heel-slide','Lie on your back, knees bent. Slide one heel along the floor, then return and switch.','Breathe out as the heel slides away.','Avoid twisting your hips.','Slide only a short distance.',8],
  ['prone-w','Prone W raise','Back','prone','Lie face down. Form a W with your arms and lift your hands slightly as shoulder blades draw together.','Breathe out as the arms lift.','Avoid shrugging or lifting your head high.','Keep hands down and gently squeeze shoulder blades.',6],
  ['side-reach','Standing side reach','Stretching','reach','Reach one arm overhead and lean gently to the opposite side. Switch sides.','Breathe into the side of the ribs.','Avoid twisting or leaning forward.','Keep the reaching hand at shoulder height.',20],
  ['ankle-rock','Ankle rocks','Mobility','ankle','With wall support, bend your front knee slightly over your toes, keeping heel down.','Breathe evenly as you rock.','Avoid letting the foot roll in.','Use a shorter staggered stance.',8],
  ['clamshell','Clamshell','Glutes','clam','Lie on your side with knees bent. Keep feet together and lift the top knee. Switch sides.','Breathe out as the knee opens.','Avoid rolling the pelvis backward.','Open the knee only a little.',8],
  ['toe-raise','Toe raises','Calves','toe','Stand with wall support and lift the front of both feet with heels grounded.','Breathe out as toes lift.','Avoid rocking your whole body backward.','Practice seated.',10],
  ['wall-hold','Shallow wall sit','Legs','squat','Lean against a wall, slide down slightly and hold with feet flat. Stand slowly.','Keep breathing all the way through.','Avoid dropping too low or holding your breath.','Use a very shallow bend or sit to stand.',15],
]

const dumbbell: Movement[] = [
  ['curl','Dumbbell biceps curl','Arms','curl','Start with palms forward. Keep elbows beside you and lift and lower the weights slowly.','Exhale up; inhale down.','Avoid swinging your torso or bending wrists.','Practice without weights, or use one lighter household item.'],
  ['hammer','Hammer curl','Arms','curl','Keep palms facing each other as you curl weights with elbows close to your ribs.','Exhale during the curl.','Avoid rocking your upper body.','Do the same movement unloaded.'],
  ['floor-press','Dumbbell floor press','Chest','press','Lie on your back, knees bent. Press dumbbells above your shoulders and lower until upper arms gently touch the floor.','Exhale during the press.','Avoid flaring your elbows straight out or dropping the weights.','Use wall push-ups.'],
  ['row','Bent-over row','Back','row','Hinge at your hips with a long spine. Pull elbows back toward your ribs and lower slowly.','Exhale as you pull.','Avoid rounding your back or jerking the weight.','Use a prone W raise.'],
  ['goblet','Goblet squat','Legs','goblet','Hold one dumbbell close to your chest. Sit back and down, then stand with feet flat.','Exhale as you stand.','Keep knees tracking over the toes.','Use a shallow bodyweight squat.'],
  ['rdl','Romanian deadlift','Legs','hinge','Hold the weights near your thighs. Push hips back with soft knees and stand before your spine rounds.','Exhale as you stand.','Keep the weights close instead of reaching for the floor.','Use the unloaded hip hinge.'],
  ['shoulder-press','Dumbbell shoulder press','Shoulders','overhead','Start with weights by shoulders. Press upward in a comfortable range and lower slowly.','Exhale as you press.','Avoid leaning back or shrugging aggressively.','Try unloaded wall slides.'],
  ['loaded-lunge','Dumbbell reverse lunge','Legs','loaded-lunge','Hold weights at your sides. Step back, bend both knees comfortably, and return. Alternate sides.','Exhale as you return to standing.','Avoid wobbling or striking your rear knee on the floor.','Use a supported bodyweight reverse lunge.',8],
  ['carry','Farmer’s carry','Core','carry','Hold weights at your sides and walk slowly on a clear surface.','Breathe evenly as you walk.','Avoid leaning or clenching your breath.','Walk without weights or hold one lighter item.',20],
  ['loaded-calf','Dumbbell calf raise','Calves','calf','Hold one dumbbell and use wall support with the other hand. Lift and lower heels slowly.','Exhale as you lift.','Avoid bouncing or rolling onto the outside of the feet.','Use wall-supported bodyweight calf raises.',12],
]

const timed = new Set(['march','step-touch','heel-dig','cross-stretch','calf-stretch','side-reach','wall-hold','carry'])
const singleWeight = new Set(['goblet','loaded-calf'])
function build(rows: Movement[], loaded: boolean) {
  return rows.map(([id, name, group, pose, form, breathing, mistake, alternative, reps = 10]) => ({
    id, name, group, pose, form, breathing, mistake, alternative, reps, timed: timed.has(id),
    equipment: loaded ? 'Dumbbell' as const : 'Bodyweight' as const,
    weights: loaded ? singleWeight.has(id) ? 1 : 2 : 0,
    difficulty: loaded || ['bird-dog','dead-bug','reverse-lunge'].includes(id) ? 'Progression' : 'Beginner',
    sets: ['Mobility','Stretching','Cardio'].includes(group) ? 1 : 2,
    rest: ['Mobility','Stretching','Cardio'].includes(group) ? 20 : 60,
    source: loaded || ['bird-dog','dead-bug','clamshell'].includes(id) ? ace : nhs,
  }))
}
export const exercises = [...build(bodyweight, false), ...build(dumbbell, true)]
export type Exercise = typeof exercises[number]
export const exerciseById = new Map(exercises.map(exercise => [exercise.id, exercise]))
export const groups = [...new Set(exercises.map(exercise => exercise.group))].sort()
