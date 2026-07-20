const { chmod } = require('node:fs/promises')
const { join } = require('node:path')

async function chmodIfPresent(helperPath) {
  try {
    await chmod(helperPath, 0o755)
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return
    }

    throw error
  }
}

async function fixLocalNodePtyPermissions() {
  const helperPaths = ['darwin-arm64', 'darwin-x64'].map((arch) =>
    join(__dirname, '..', 'node_modules', 'node-pty', 'prebuilds', arch, 'spawn-helper')
  )

  await Promise.all(helperPaths.map(chmodIfPresent))
}

exports.default = async function fixNodePtyPermissions(context) {
  if (context.electronPlatformName !== 'darwin') {
    return
  }

  const helperPaths = ['darwin-arm64', 'darwin-x64'].map((arch) =>
    join(
      context.appOutDir,
      `${context.packager.appInfo.productFilename}.app`,
      'Contents',
      'Resources',
      'app.asar.unpacked',
      'node_modules',
      'node-pty',
      'prebuilds',
      arch,
      'spawn-helper'
    )
  )

  await Promise.all(helperPaths.map(chmodIfPresent))
}

if (require.main === module && process.platform === 'darwin') {
  fixLocalNodePtyPermissions().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
