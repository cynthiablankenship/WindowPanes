import { copyFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const root = join(import.meta.dirname, '..')
const npmExecPath = process.env.npm_execpath
const npmCommand = npmExecPath ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm'
const npmArgs = npmExecPath ? [npmExecPath, 'run', 'build'] : ['run', 'build']

await run(npmCommand, npmArgs)
await copyFile(join(root, 'out', 'renderer', 'gemstone.html'), join(root, 'out', 'renderer', 'index.html'))

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit'
    })

    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${command} ${args.join(' ')} exited with signal ${signal}`))
        return
      }

      if (code !== 0) {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
        return
      }

      resolve()
    })
  })
}
