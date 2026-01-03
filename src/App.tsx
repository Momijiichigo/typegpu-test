import {onMount, type Component} from 'solid-js';
import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

const App: Component = () => {
  let canvas: HTMLCanvasElement;
  onMount(async () => {
    const ctx = canvas!.getContext('2d')!;
    canvas!.width = 1000;
    canvas!.height = 900;



    const charSigns = ['✊️', '✌️', '🖐️']
    // const charSigns = ['🟢', '🔶', '💙']

    const charRadius = 0.02
    ctx.font = `${charRadius * 1.25/0.02}em serif`;
    const PARTICLE_NUM = 500
    const ATTRACTION_CONST = 0.0000004 / 0.03 * charRadius
    const MAX_VELOCITY = 0.002 / 0.03 * charRadius

    const root = await tgpu.init()


    const ParticleData = d.struct({
      position: d.vec2f,
      velocity: d.vec2f,
      sign: d.i32
    })

    const particleBuffers = [0, 1].map(() => root.createBuffer(d.arrayOf(ParticleData, PARTICLE_NUM)).$usage('storage'))

    const initialPositions = [
      {
        x: 0.2,
        y: 0.6,
        radius: 0.2,
        num: (PARTICLE_NUM / 3) | 0,
        sign: 0
      },
      {
        x: 0.8,
        y: 0.65,
        radius: 0.2,
        num: (PARTICLE_NUM / 3) | 0,
        sign: 1
      },
      {
        x: 0.5,
        y: 0.25,
        radius: 0.2,
        num: PARTICLE_NUM - (PARTICLE_NUM / 3) | 0,
        sign: 2
      },
    ]

    const initializePositions = () => {

      const pointData = [] as Array<{
        position: d.v2f,
        velocity: d.v2f,
        sign: number
      }>

      for (const group of initialPositions) {
        for (let i = 0; i < group.num; i++) {
          const angle = Math.random() * Math.PI * 2
          const radius = Math.random() * group.radius
          pointData.push({
            position: d.vec2f(
              group.x + Math.cos(angle) * radius,
              group.y + Math.sin(angle) * radius
            ),
            velocity: d.vec2f(Math.random() * 0.001 - 0.0005, Math.random() * 0.001 - 0.0005),
            sign: group.sign
          })
        }
      }


      particleBuffers[0].write(pointData)
      particleBuffers[1].write(pointData)
    }
    initializePositions()

    const ParticleDataArray = d.arrayOf(ParticleData)

    const computeBindGroupLayout = tgpu.bindGroupLayout({
      currentPoints: {
        storage: ParticleDataArray,
        access: 'readonly'
      },
      nextPoints: {
        storage: ParticleDataArray,
        access: 'mutable'
      }
    })

    const {currentPoints, nextPoints} = computeBindGroupLayout.bound

    const attractOrder = (self: number, other: number) => {
      'use gpu'

      let relation = (other - self + 3) % 3

      if (relation === 2) {
        relation = -1
      }

      return relation

    }
    const simulate = (index: number) => {
      'use gpu'
      const instanceInfo = ParticleData(currentPoints.value[index])

      let dVel = d.vec2f();

      for (let j = d.u32(0); j < currentPoints.value.length; j++) {
        if (j === index) continue;

        const other = currentPoints.value[j]

        const attrOrder = attractOrder(instanceInfo.sign, other.sign)

        if (attrOrder === -1 && std.distance(instanceInfo.position, other.position) < charRadius) {
          instanceInfo.sign = other.sign
          continue
        }

        const attraction = ATTRACTION_CONST * d.f32(attrOrder)
        const shifts = [
          d.vec2f(0.0, 0.0),

          d.vec2f(1.0, 0.0),
          d.vec2f(-1.0, 0.0),
          d.vec2f(0.0, 1.0),
          d.vec2f(0.0, -1.0),

          // d.vec2f(1.0, 1.0),
          // d.vec2f(-1.0, 1.0),
          // d.vec2f(1.0, -1.0),
          // d.vec2f(-1.0, -1.0),
        ]
        let strength = d.vec2f();
        for (let i = 0; i < shifts.length; i++) {
          const shift = shifts[i]


          const r = std.sub(std.add(other.position, shift), instanceInfo.position);
          strength = std.add(strength, std.div(r, std.length(r) ** 3))
          // const rAbs = std.length(r)
          // strength = std.add(strength, std.mul(r, std.pow(2.0, -(rAbs ** 2.0))* rAbs))
        }
        // const strength = std.mul(r, std.pow(1.4, -(rAbs ** 2.0) * rAbs))

        dVel = std.add(dVel, std.mul(attraction, strength))
      }

      const resultVel = std.add(instanceInfo.velocity, dVel)

      if (std.length(resultVel) > MAX_VELOCITY) {
        instanceInfo.velocity = std.mul(resultVel, MAX_VELOCITY / std.length(resultVel))
      } else {

        instanceInfo.velocity = d.vec2f(resultVel)

      }
      instanceInfo.position.x = (instanceInfo.position.x + 1.0) % 1.0
      instanceInfo.position.y = (instanceInfo.position.y + 1.0) % 1.0
      // if ((instanceInfo.position.x < 0.0 && instanceInfo.velocity.x < 0.0) || (instanceInfo.position.x > 1.0 && instanceInfo.velocity.x > 0.0)) {
      //   instanceInfo.velocity.x *= -1.0
      // }
      // if ((instanceInfo.position.y < 0.0 && instanceInfo.velocity.y < 0.0) || (instanceInfo.position.y > 1.0 && instanceInfo.velocity.y > 0.0)) {
      //   instanceInfo.velocity.y *= -1.0
      // }
      instanceInfo.position = std.add(instanceInfo.position, instanceInfo.velocity)



      nextPoints.value[index] = ParticleData(instanceInfo)

    }

    const simulatePipeline = root['~unstable'].createGuardedComputePipeline(simulate)

    const computeBindGroups = [0, 1].map(i =>
      root.createBindGroup(
        computeBindGroupLayout,
        {
          currentPoints: particleBuffers[i],
          nextPoints: particleBuffers[1 - i]
        }
      ))

    let even = false
    let disposed = false

    const render = () => {

      if (disposed) return;

      even = !even




      particleBuffers[even ? 0 : 1].read().then(value => {
        ctx.clearRect(0, 0, canvas!.width, canvas!.height)
        for (const particleInfo of value) {
          const {position: {x, y}, sign} = particleInfo
          ctx.strokeText(charSigns[sign], x * canvas!.width, y * canvas!.height)
        }
      })
      simulatePipeline.with(computeBindGroups[even ? 0 : 1]).dispatchThreads(PARTICLE_NUM)

      requestAnimationFrame(render)
    }

    requestAnimationFrame(render)






  })
  let container: HTMLDivElement;
  return (
    <div ref={container!} class="w-screen h-screen flex justify-center items-center bg-white">
      <canvas ref={canvas!} class="border border-black bg-black"></canvas>



    </div>
  );
};

export default App;
