export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ==========================================
    // 🔑 PASSWORD RAHASIA ADMIN
    // ==========================================
    const ADMIN_SECRET_KEY = "rahasia123"; 

    // ==========================================
    // 🔗 DIRECT LINKS UNTUK IKLAN
    // ==========================================
    const ADSTERRA_DIRECT_LINK_1 = "https://www.highratecpmgate.com/link-ads-1"; 
    const ADSTERRA_DIRECT_LINK_2 = "https://www.highratecpmgate.com/link-ads-2"; 

    // ==========================================
    // 🛡️ REDIRECT AMAN UNTUK HALAMAN UTAMA (ROOT)
    // ==========================================
    if (url.pathname === '/' || url.pathname === '') {
      return Response.redirect('https://www.google.com', 302);
    }

    // 1. API Endpoint to Get List of All Videos
    if (url.pathname === '/api/videos' && request.method === 'GET') {
      try {
        const list = await env.VIDEOS_KV.list({ prefix: 'video:' });
        const videos = [];

        for (const key of list.keys) {
          const videoId = key.name.replace('video:', '');
          const metadata = key.metadata || {};
          videos.push({
            id: videoId,
            title: metadata.title || `Video ${videoId}`,
            mimeType: metadata.mimeType || 'video/mp4',
            size: metadata.size || 0,
            uploadedAt: metadata.uploadedAt || new Date().toISOString(),
            watchUrl: `${url.origin}/v/${videoId}`,
            embedUrl: `${url.origin}/embed/${videoId}`,
            streamUrl: `${url.origin}/stream/${videoId}`
          });
        }

        videos.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

        return new Response(JSON.stringify({ success: true, videos }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { 
          status: 500, 
          headers: { 'Access-Control-Allow-Origin': '*' } 
        });
      }
    }

    // 2. API Endpoint to Upload Video (Protected with Password)
    if (url.pathname === '/api/upload' && request.method === 'POST') {
      try {
        const formData = await request.formData();
        const authKey = formData.get('secret_key');

        if (authKey !== ADMIN_SECRET_KEY) {
          return new Response(JSON.stringify({ error: 'Access Denied: Incorrect Admin Password!' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }

        const videoFile = formData.get('video');
        const customTitle = formData.get('title');
        
        if (!videoFile) {
          return new Response(JSON.stringify({ error: 'Video file not found.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }

        const videoTitle = (customTitle && customTitle.trim() !== '') ? customTitle.trim() : videoFile.name;
        const videoId = Math.random().toString(36).substring(2, 10);
        const arrayBuffer = await videoFile.arrayBuffer();

        await env.VIDEOS_KV.put(`video:${videoId}`, arrayBuffer, {
          metadata: {
            title: videoTitle,
            mimeType: videoFile.type || 'video/mp4',
            size: videoFile.size,
            uploadedAt: new Date().toISOString()
          }
        });

        return new Response(JSON.stringify({
          success: true,
          videoId: videoId,
          title: videoTitle,
          watchUrl: `${url.origin}/v/${videoId}`,
          embedUrl: `${url.origin}/embed/${videoId}`,
          streamUrl: `${url.origin}/stream/${videoId}`
        }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { 
          status: 500, 
          headers: { 'Access-Control-Allow-Origin': '*' } 
        });
      }
    }

    // 3. API Endpoint to Delete Video (Protected with Password)
    if (url.pathname === '/api/delete' && request.method === 'DELETE') {
      try {
        const authKey = request.headers.get('x-secret-key');

        if (authKey !== ADMIN_SECRET_KEY) {
          return new Response(JSON.stringify({ error: 'Access Denied: Incorrect Admin Password!' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }

        const videoId = url.searchParams.get('id');
        if (!videoId) {
          return new Response(JSON.stringify({ error: 'Video ID is required.' }), { 
            status: 400, 
            headers: { 'Access-Control-Allow-Origin': '*' } 
          });
        }

        await env.VIDEOS_KV.delete(`video:${videoId}`);
        return new Response(JSON.stringify({ success: true, message: 'Video deleted successfully.' }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { 
          status: 500, 
          headers: { 'Access-Control-Allow-Origin': '*' } 
        });
      }
    }

    // 4. Raw Stream Video Endpoint (DENGAN PROTEKSI AKSES LANGSUNG)
    if (url.pathname.startsWith('/stream/')) {
      const referer = request.headers.get('referer') || '';
      const secFetchMode = request.headers.get('sec-fetch-mode') || '';

      // Blokir jika dibuka langsung di tab browser tanpa melalui halaman /v/
      if (secFetchMode === 'navigate' && !referer.includes(url.origin)) {
        return new Response('Akses Langsung Ditolak! Silakan tonton melalui halaman resmi.', { 
          status: 403,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }

      const videoId = url.pathname.split('/stream/')[1];
      const videoData = await env.VIDEOS_KV.getWithMetadata(`video:${videoId}`, { type: 'arrayBuffer' });

      if (!videoData.value) {
        return new Response('Video not found or has been deleted.', { status: 404 });
      }

      return new Response(videoData.value, {
        headers: {
          'Content-Type': videoData.metadata?.mimeType || 'video/mp4',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=31536000'
        }
      });
    }

    // 5. Watch Page Endpoint (/v/videoId)
    if (url.pathname.startsWith('/v/')) {
      const videoId = url.pathname.split('/v/')[1];
      const videoData = await env.VIDEOS_KV.getWithMetadata(`video:${videoId}`);

      if (!videoData.metadata) {
        return new Response('Video not found.', { status: 404 });
      }

      const streamUrl = `${url.origin}/stream/${videoId}`;
      const title = videoData.metadata.title || `Video ${videoId}`;

      const watchHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - StreamMax</title>

  <meta property="og:type" content="website">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="Watch ${title} on StreamMax.">
  <meta property="og:url" content="${url.href}">

  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
  <style>
    body { background-color: #0d1117; color: #c9d1d9; font-family: system-ui, -apple-system, sans-serif; user-select: none; }
    .navbar { background-color: #161b22; border-bottom: 1px solid #30363d; }
    .video-container { background: #000; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5); position: relative; }
    video { width: 100%; max-height: 75vh; object-fit: contain; background: #000; }
    
    .btn-ad-download { background: linear-gradient(45deg, #28a745, #20c997); color: #fff; border: none; font-weight: bold; text-decoration: none; }
    .btn-ad-download:hover { background: linear-gradient(45deg, #218838, #1baa80); color: #fff; }
    .btn-ad-stream { background: linear-gradient(45deg, #dc3545, #fd7e14); color: #fff; border: none; font-weight: bold; text-decoration: none; }
    .btn-ad-stream:hover { background: linear-gradient(45deg, #c82333, #e06d12); color: #fff; }
  </style>

  <script>
    document.addEventListener('contextmenu', event => event.preventDefault());
    document.onkeydown = function (e) {
      if (e.keyCode === 123) return false;
      if (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) return false;
      if (e.ctrlKey && e.keyCode === 85) return false;
      if (e.ctrlKey && e.keyCode === 83) return false;
    };
  </script>
</head>
<body oncontextmenu="return false;">
  <nav class="navbar navbar-dark mb-4">
    <div class="container">
      <span class="navbar-brand fw-bold text-primary mb-0 h1" style="cursor: default;"><i class="fa-solid fa-play me-2"></i>StreamMax</span>
    </div>
  </nav>

  <div class="container my-3">
    <div class="row justify-content-center">
      <div class="col-lg-10">
        <div class="video-container mb-3">
          <video controls autoplay playsinline preload="metadata" controlsList="nodownload" disablePictureInPicture oncontextmenu="return false;">
            <source src="${streamUrl}" type="video/mp4">
            Your browser does not support video playback.
          </video>
        </div>

        <div class="d-grid gap-2 d-md-flex justify-content-md-between">
          <a href="${ADSTERRA_DIRECT_LINK_1}" target="_blank" rel="noopener noreferrer" class="btn btn-ad-download py-2 px-4 shadow-sm w-100">
            <i class="fa-solid fa-circle-play me-2"></i>WATCH FULL LENGTH VIDEO
          </a>
          <a href="${ADSTERRA_DIRECT_LINK_2}" target="_blank" rel="noopener noreferrer" class="btn btn-ad-stream py-2 px-4 shadow-sm w-100">
            <i class="fa-solid fa-forward me-2"></i>NEXT EPISODE / PART 2
          </a>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

      return new Response(watchHtml, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    // 6. Embed Player Endpoint (/embed/videoId)
    if (url.pathname.startsWith('/embed/')) {
      const videoId = url.pathname.split('/embed/')[1];
      const streamUrl = `${url.origin}/stream/${videoId}`;
      
      const embedHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Embed Video</title>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; user-select: none; }
    body, html { width: 100%; height: 100%; background: #000; overflow: hidden; display: flex; flex-direction: column; font-family: system-ui, -apple-system, sans-serif; }
    .video-wrapper { flex: 1; display: flex; align-items: center; justify-content: center; background: #000; overflow: hidden; }
    video { width: 100%; height: 100%; object-fit: contain; }
    .buttons-container { display: flex; gap: 8px; padding: 10px; background: #0d1117; border-top: 1px solid #21262d; }
    .btn-ad { flex: 1; padding: 10px 12px; border-radius: 6px; font-weight: bold; font-size: 13px; text-decoration: none; text-align: center; display: flex; align-items: center; justify-content: center; gap: 6px; transition: 0.2s; }
    .btn-green { background: #2ea44f; color: #fff; }
    .btn-green:hover { background: #2c974b; }
    .btn-red { background: #da3633; color: #fff; }
    .btn-red:hover { background: #b62324; }
  </style>

  <script>
    document.addEventListener('contextmenu', event => event.preventDefault());
    document.onkeydown = function (e) {
      if (e.keyCode === 123) return false;
      if (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) return false;
      if (e.ctrlKey && e.keyCode === 85) return false;
      if (e.ctrlKey && e.keyCode === 83) return false;
    };
  </script>
</head>
<body oncontextmenu="return false;">
  <div class="video-wrapper">
    <video controls autoplay playsinline preload="metadata" controlsList="nodownload" disablePictureInPicture oncontextmenu="return false;">
      <source src="${streamUrl}" type="video/mp4">
    </video>
  </div>
  
  <div class="buttons-container">
    <a href="${ADSTERRA_DIRECT_LINK_1}" target="_blank" rel="noopener noreferrer" class="btn-ad btn-green">
      <i class="fa-solid fa-circle-play"></i> WATCH FULL LENGTH VIDEO
    </a>
    <a href="${ADSTERRA_DIRECT_LINK_2}" target="_blank" rel="noopener noreferrer" class="btn-ad btn-red">
      <i class="fa-solid fa-forward"></i> NEXT EPISODE / PART 2
    </a>
  </div>
</body>
</html>`;

      return new Response(embedHtml, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    return env.ASSETS.fetch(request);
  }
};
