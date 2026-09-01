const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Directory containing GIF files (project root)
const GIF_DIR = __dirname;

// Scan for .gif files and build slug map
function getGifMap() {
  const files = fs.readdirSync(GIF_DIR).filter(f => f.toLowerCase().endsWith('.gif'));
  const map = {};
  for (const file of files) {
    const slug = file
      .replace(/\.gif$/i, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    map[slug] = file;
  }
  return map;
}

// Serve static GIF files
app.use('/gifs', express.static(GIF_DIR, {
  setHeaders: (res, filePath) => {
    if (filePath.toLowerCase().endsWith('.gif')) {
      // Ensure no caching so GIF always replays from start
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
  }
}));

// Home page — list all GIFs
app.get('/', (req, res) => {
  const gifMap = getGifMap();
  const links = Object.entries(gifMap)
    .map(([slug, file]) => `<li><a href="/${slug}">${file}</a></li>`)
    .join('\n');

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>QR Code Game</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 600px; margin: 40px auto; padding: 0 20px; background: #111; color: #eee; }
    a { color: #6cf; text-decoration: none; }
    a:hover { text-decoration: underline; }
    h1 { font-size: 1.5em; }
    ul { list-style: none; padding: 0; }
    li { padding: 8px 0; border-bottom: 1px solid #333; }
  </style>
</head>
<body>
  <h1>QR Code Game</h1>
  <p>Choose a move:</p>
  <ul>${links}</ul>
</body>
</html>`);
});

// Individual GIF page
app.get('/:slug', (req, res) => {
  const gifMap = getGifMap();
  const { slug } = req.params;
  const fileName = gifMap[slug];

  if (!fileName) {
    return res.status(404).send('Not found');
  }

  // URL-encode the filename for the /gifs path
  const encodedFile = encodeURIComponent(fileName);

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${slug}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: system-ui, sans-serif;
      background: #111;
      color: #eee;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    #gif-container {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    #gif-container img {
      max-width: 90vw;
      max-height: 70vh;
      border-radius: 8px;
    }
    #number-display {
      display: none;
      font-size: 8rem;
      font-weight: 900;
      color: #fff;
      text-shadow: 0 0 40px rgba(100,200,255,0.8), 0 0 80px rgba(100,200,255,0.4);
      animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }
    @keyframes popIn {
      0% { transform: scale(0); opacity: 0; }
      100% { transform: scale(1); opacity: 1; }
    }
    #loading {
      color: #888;
      font-size: 1.2rem;
      margin-top: 20px;
    }
    a.back { position: fixed; top: 20px; left: 20px; color: #6cf; text-decoration: none; font-size: 0.9rem; }
    a.back:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <a class="back" href="/">&#8592; Back</a>
  <div id="gif-container">
    <img id="gif-img" src="/gifs/${encodedFile}" alt="${slug}">
  </div>
  <div id="number-display"></div>
  <div id="loading">Playing animation...</div>

  <script>
    (function() {
      const img = document.getElementById('gif-img');
      const numberDisplay = document.getElementById('number-display');
      const gifContainer = document.getElementById('gif-container');
      const loading = document.getElementById('loading');
      const gifSrc = img.src;

      // Parse GIF binary to calculate total animation duration
      async function getGifDuration(url) {
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        const data = new Uint8Array(buffer);
        let totalDuration = 0;
        let frameCount = 0;

        // Walk through the GIF looking for Graphic Control Extension (0x21 0xF9)
        // followed by block size (0x04), then packed byte, then 2-byte delay, then transparent index
        for (let i = 0; i < data.length - 8; i++) {
          if (data[i] === 0x21 && data[i + 1] === 0xF9 && data[i + 2] === 0x04) {
            const packed = data[i + 3];
            const delayLow = data[i + 4];
            const delayHigh = data[i + 5];
            let delay = (delayHigh << 8) | delayLow; // in hundredths of a second

            // Many GIFs use 0 delay which browsers interpret as ~10ms (100fps)
            // but spec says 0 should be treated as 100ms
            if (delay === 0) delay = 10; // 100ms in hundredths

            totalDuration += delay;
            frameCount++;
            i += 7; // skip past this block (8 bytes total from 0x21)
          }
        }

        // Convert from hundredths of a second to milliseconds
        return { duration: totalDuration * 10, frames: frameCount };
      }

      async function run() {
        try {
          const { duration, frames } = await getGifDuration(gifSrc);
          console.log('GIF duration:', duration, 'ms,', frames, 'frames');

          // Wait for the GIF to finish one loop
          setTimeout(() => {
            // Hide the GIF and show the number
            gifContainer.style.display = 'none';
            loading.style.display = 'none';

            const number = Math.floor(Math.random() * 5) + 1;
            numberDisplay.textContent = number;
            numberDisplay.style.display = 'block';
          }, duration);
        } catch (err) {
          console.error('Failed to parse GIF, falling back to 3s timeout', err);
          setTimeout(() => {
            gifContainer.style.display = 'none';
            loading.style.display = 'none';
            const number = Math.floor(Math.random() * 5) + 1;
            numberDisplay.textContent = number;
            numberDisplay.style.display = 'block';
          }, 3000);
        }
      }

      // Start when the image has loaded
      if (img.complete) {
        run();
      } else {
        img.onload = run;
      }
    })();
  </script>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
