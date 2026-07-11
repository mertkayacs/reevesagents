// Fake provider CLI for the real-pty test. Prints a ready marker, echoes each line
// it receives (stripping the bracketed-paste wrappers reevesagents-win sends), and
// exits on Ctrl+C (\x03) or the word "exit". It runs under a real ConPTY/pty so the
// runtime's spawn/read/send/interrupt/kill paths are exercised end to end.

process.stdout.write('STUB READY\n')

let buffer = ''
process.stdin.setEncoding('utf8')
process.stdin.resume()

process.stdin.on('data', chunk => {
  for (const ch of chunk) {
    if (ch === '\x03') {
      process.stdout.write('BYE\n')
      process.exit(0)
    }
    if (ch === '\r' || ch === '\n') {
      const line = buffer.replace(/\x1b\[20[01]~/g, '').trim()
      buffer = ''
      if (line === 'exit') {
        process.stdout.write('BYE\n')
        process.exit(0)
      }
      if (line) process.stdout.write(`ECHO: ${line}\n`)
    } else {
      buffer += ch
    }
  }
})
