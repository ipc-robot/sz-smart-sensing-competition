import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }
}

loadEnv(path.join(__dirname, '.env'));

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 38140);
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT_DIR, 'data'));
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const MAX_DOC_MB = Number(process.env.MAX_DOC_MB || 50);
const MAX_VIDEO_MB = Number(process.env.MAX_VIDEO_MB || 200);
const MAX_DOC_BYTES = MAX_DOC_MB * 1024 * 1024;
const MAX_VIDEO_BYTES = MAX_VIDEO_MB * 1024 * 1024;
const MIN_FREE_DISK_MB = Number(process.env.MIN_FREE_DISK_MB || 2048);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const CORS_ORIGINS = new Set(
  (process.env.CORS_ORIGINS || 'https://ipc-robot.github.io,http://106.53.200.120:38000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);

const ALLOWED_TRACKS = new Set(['柔性电子', '具身智能机器人', '开源鸿蒙/RISC-V']);
const DOC_EXTS = new Set(['.pdf', '.doc', '.docx']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.mkv']);
const SESSION_COOKIE = 'sz_admin_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const PENDING_TTL_MS = 2 * 60 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 20;

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'submissions.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    upload_token TEXT,
    track TEXT NOT NULL,
    team_name TEXT NOT NULL,
    project_title TEXT NOT NULL,
    leader_name TEXT NOT NULL,
    school TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    members TEXT DEFAULT '',
    advisor TEXT DEFAULT '',
    summary TEXT NOT NULL,
    doc_original_name TEXT,
    doc_stored_name TEXT,
    doc_size INTEGER,
    doc_sha256 TEXT,
    video_original_name TEXT,
    video_stored_name TEXT,
    video_size INTEGER,
    video_sha256 TEXT,
    video_url TEXT DEFAULT '',
    video_note TEXT DEFAULT '',
    client_ip TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    submitted_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_submissions_status_created ON submissions(status, created_at);
`);

const rateLimitMap = new Map();

function cleanupPending() {
  const cutoff = new Date(Date.now() - PENDING_TTL_MS).toISOString();
  const stale = db
    .prepare("SELECT id FROM submissions WHERE status = 'pending' AND created_at < ?")
    .all(cutoff);
  if (stale.length === 0) return;
  const delStmt = db.prepare('DELETE FROM submissions WHERE id = ?');
  for (const row of stale) {
    delStmt.run(row.id);
    const dir = path.join(UPLOADS_DIR, row.id);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

cleanupPending();
setInterval(cleanupPending, 30 * 60 * 1000).unref();

function getClientIp(req) {
  const remote = req.socket?.remoteAddress || '';
  const isLoopback = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
  if (isLoopback && req.headers['x-forwarded-for']) {
    const first = String(req.headers['x-forwarded-for']).split(',')[0].trim();
    if (first) return first;
  }
  return remote;
}

function checkRateLimit(ip) {
  const now = Date.now();
  const hits = (rateLimitMap.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (hits.length >= RATE_LIMIT_MAX) {
    rateLimitMap.set(ip, hits);
    return false;
  }
  hits.push(now);
  rateLimitMap.set(ip, hits);
  return true;
}

function checkFreeDisk() {
  try {
    const stat = fs.statfsSync(DATA_DIR);
    const freeBytes = Number(stat.bavail) * Number(stat.bsize);
    return freeBytes >= MIN_FREE_DISK_MB * 1024 * 1024;
  } catch {
    return true;
  }
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && CORS_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Upload-Token, X-File-Name');
  }
}

function sendJson(res, status, data, extraHeaders = {}) {
  const payload = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(payload);
}

function readJsonBody(req, maxBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(Object.assign(new Error('请求体过大'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(Object.assign(new Error('无效的 JSON 请求格式'), { statusCode: 400 }));
      }
    });
    req.on('error', (err) => reject(err));
  });
}

function timingSafeEqualStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function createSessionToken() {
  const exp = Date.now() + SESSION_TTL_MS;
  const nonce = crypto.randomBytes(12).toString('hex');
  const payload = `${exp}.${nonce}`;
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [expStr, nonce, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(`${expStr}.${nonce}`).digest('hex');
  return timingSafeEqualStr(sig, expected);
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  }
  return out;
}

function isAdminAuthed(req) {
  const cookies = parseCookies(req);
  return verifySessionToken(cookies[SESSION_COOKIE]);
}

function cleanStr(val, maxLen) {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

function sanitizeDisplayFilename(raw) {
  const base = path.basename(String(raw || 'file')).replace(/[\r\n\0\/\\]+/g, '_').trim();
  return base.slice(0, 180) || 'upload';
}

function checkMagicBytes(ext, headerBuf) {
  if (headerBuf.length < 4) return false;
  if (ext === '.pdf') {
    return headerBuf.subarray(0, 5).toString('ascii') === '%PDF-';
  }
  if (ext === '.docx') {
    return headerBuf[0] === 0x50 && headerBuf[1] === 0x4b && headerBuf[2] === 0x03 && headerBuf[3] === 0x04;
  }
  if (ext === '.doc') {
    const isOle =
      headerBuf[0] === 0xd0 &&
      headerBuf[1] === 0xcf &&
      headerBuf[2] === 0x11 &&
      headerBuf[3] === 0xe0;
    const isRtf = headerBuf.subarray(0, 5).toString('ascii') === '{\\rtf';
    return isOle || isRtf;
  }
  if (ext === '.mp4' || ext === '.mov') {
    if (headerBuf.length < 8) return false;
    const box = headerBuf.subarray(4, 8).toString('ascii');
    return box === 'ftyp' || box === 'moov' || box === 'mdat' || box === 'wide' || box === 'free';
  }
  if (ext === '.webm' || ext === '.mkv') {
    return headerBuf[0] === 0x1a && headerBuf[1] === 0x45 && headerBuf[2] === 0xdf && headerBuf[3] === 0xa3;
  }
  return false;
}

function generateId() {
  let id;
  const check = db.prepare('SELECT 1 FROM submissions WHERE id = ?');
  do {
    const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
    id = `SZ2026-${rand}`;
  } while (check.get(id));
  return id;
}

function csvCell(val) {
  let str = val == null ? '' : String(val);
  if (/^[=+\-@]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

function validateInitPayload(body) {
  const track = cleanStr(body.track, 40);
  const teamName = cleanStr(body.teamName, 80);
  const projectTitle = cleanStr(body.projectTitle, 120);
  const leaderName = cleanStr(body.leaderName, 50);
  const school = cleanStr(body.school, 100);
  const phone = cleanStr(body.phone, 30);
  const email = cleanStr(body.email, 100);
  const members = cleanStr(body.members, 200);
  const advisor = cleanStr(body.advisor, 100);
  const summary = cleanStr(body.summary, 600);
  const videoUrl = cleanStr(body.videoUrl, 300);
  const videoNote = cleanStr(body.videoNote, 120);

  if (!ALLOWED_TRACKS.has(track)) return { error: '请选择有效的参赛赛题' };
  if (teamName.length < 2) return { error: '请填写队伍名称（至少 2 个字符）' };
  if (projectTitle.length < 2) return { error: '请填写作品名称（至少 2 个字符）' };
  if (leaderName.length < 2) return { error: '请填写队长姓名' };
  if (school.length < 2) return { error: '请填写学校或单位名称' };
  if (!/^[\d+\-\s]{6,20}$/.test(phone)) return { error: '请填写有效的联系电话' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: '请填写有效的电子邮箱' };
  if (summary.length < 20 || summary.length > 500) {
    return { error: '作品简介需在 20 至 500 字之间' };
  }
  if (videoUrl && !/^https?:\/\/\S+$/i.test(videoUrl)) {
    return { error: '视频链接需以 http:// 或 https:// 开头' };
  }

  const docSize = Number(body.docSize || 0);
  if (!Number.isFinite(docSize) || docSize <= 0 || docSize > MAX_DOC_BYTES) {
    return { error: `技术文档大小需在 1B 至 ${MAX_DOC_MB}MB 之间` };
  }
  const videoSize = Number(body.videoSize || 0);
  if (videoSize < 0 || videoSize > MAX_VIDEO_BYTES) {
    return { error: `作品介绍视频大小不可超过 ${MAX_VIDEO_MB}MB` };
  }

  return {
    data: {
      track,
      teamName,
      projectTitle,
      leaderName,
      school,
      phone,
      email,
      members,
      advisor,
      summary,
      videoUrl,
      videoNote,
    },
  };
}

function handleFileUpload(req, res, id, kind) {
  if (!/^SZ2026-[0-9A-F]{6}$/.test(id)) {
    return sendJson(res, 400, { error: '无效的报名编号' });
  }
  if (kind !== 'doc' && kind !== 'video') {
    return sendJson(res, 400, { error: '无效的文件类型参数' });
  }

  const row = db
    .prepare('SELECT id, status, upload_token FROM submissions WHERE id = ?')
    .get(id);
  if (!row || row.status !== 'pending') {
    return sendJson(res, 404, { error: '报名会话不存在或已失效，请重新提交' });
  }

  const providedToken = String(req.headers['x-upload-token'] || '');
  if (!timingSafeEqualStr(providedToken, row.upload_token || '')) {
    return sendJson(res, 403, { error: '上传凭证无效' });
  }

  const rawNameHeader = req.headers['x-file-name'] || '';
  let decodedName;
  try {
    decodedName = decodeURIComponent(String(rawNameHeader));
  } catch {
    decodedName = String(rawNameHeader);
  }
  const originalName = sanitizeDisplayFilename(decodedName);
  const ext = path.extname(originalName).toLowerCase();
  const allowedExts = kind === 'doc' ? DOC_EXTS : VIDEO_EXTS;
  if (!allowedExts.has(ext)) {
    return sendJson(res, 400, {
      error: kind === 'doc' ? '技术文档仅支持 PDF / DOC / DOCX 格式' : '视频仅支持 MP4 / MOV / WebM / MKV 格式',
    });
  }

  const maxBytes = kind === 'doc' ? MAX_DOC_BYTES : MAX_VIDEO_BYTES;
  const contentLen = Number(req.headers['content-length'] || 0);
  if (contentLen > maxBytes) {
    return sendJson(res, 413, {
      error: `文件体积超过上限（最大 ${kind === 'doc' ? MAX_DOC_MB : MAX_VIDEO_MB}MB）`,
    });
  }

  if (!checkFreeDisk()) {
    return sendJson(res, 507, { error: '服务器磁盘可用空间不足，请联系组委会' });
  }

  const subDir = path.join(UPLOADS_DIR, id);
  fs.mkdirSync(subDir, { recursive: true });
  const tmpFile = path.join(subDir, `.tmp-${kind}-${crypto.randomBytes(6).toString('hex')}`);
  const finalName = `${kind}${ext}`;
  const finalPath = path.join(subDir, finalName);

  const writeStream = fs.createWriteStream(tmpFile, { flags: 'wx' });
  const hash = crypto.createHash('sha256');
  let received = 0;
  const headerChunks = [];
  let headerLen = 0;
  let aborted = false;

  const failUpload = (status, message) => {
    if (aborted) return;
    aborted = true;
    req.unpipe(writeStream);
    writeStream.destroy();
    fs.rmSync(tmpFile, { force: true });
    if (!res.headersSent) {
      sendJson(res, status, { error: message });
    }
  };

  req.on('data', (chunk) => {
    if (aborted) return;
    received += chunk.length;
    if (received > maxBytes) {
      failUpload(413, `文件体积超过上限（最大 ${kind === 'doc' ? MAX_DOC_MB : MAX_VIDEO_MB}MB）`);
      req.destroy();
      return;
    }
    if (headerLen < 16) {
      headerChunks.push(chunk);
      headerLen += chunk.length;
    }
    hash.update(chunk);
    if (!writeStream.write(chunk)) {
      req.pause();
    }
  });

  writeStream.on('drain', () => {
    if (!aborted) req.resume();
  });

  writeStream.on('error', () => {
    failUpload(500, '文件写入失败，请重试');
  });

  req.on('aborted', () => {
    failUpload(499, '上传已中断');
  });

  req.on('error', () => {
    failUpload(400, '上传数据流读取失败');
  });

  req.on('end', () => {
    if (aborted) return;
    if (received === 0) {
      return failUpload(400, '不能上传空文件');
    }
    const headerBuf = Buffer.concat(headerChunks).subarray(0, 16);
    if (!checkMagicBytes(ext, headerBuf)) {
      return failUpload(400, '文件内容与扩展名不匹配，请确认文件未损坏且格式正确');
    }
    writeStream.end(() => {
      if (aborted) return;
      try {
        // Remove any previous file of this kind before renaming
        for (const existing of fs.readdirSync(subDir)) {
          if (existing.startsWith(`${kind}.`)) {
            fs.rmSync(path.join(subDir, existing), { force: true });
          }
        }
        fs.renameSync(tmpFile, finalPath);
        const sha256 = hash.digest('hex');
        if (kind === 'doc') {
          db.prepare(
            'UPDATE submissions SET doc_original_name = ?, doc_stored_name = ?, doc_size = ?, doc_sha256 = ? WHERE id = ?'
          ).run(originalName, finalName, received, sha256, id);
        } else {
          db.prepare(
            'UPDATE submissions SET video_original_name = ?, video_stored_name = ?, video_size = ?, video_sha256 = ? WHERE id = ?'
          ).run(originalName, finalName, received, sha256, id);
        }
        sendJson(res, 200, { ok: true, kind, originalName, size: received, sha256 });
      } catch {
        fs.rmSync(tmpFile, { force: true });
        sendJson(res, 500, { error: '保存文件元数据失败' });
      }
    });
  });
}

const STATIC_FILES = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/index.html': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/style.css': { file: 'style.css', type: 'text/css; charset=utf-8' },
  '/script.js': { file: 'script.js', type: 'application/javascript; charset=utf-8' },
  '/assets/poster.jpg': { file: 'assets/poster.jpg', type: 'image/jpeg' },
};

const server = http.createServer(async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  try {
    // Health endpoint
    if (req.method === 'GET' && pathname === '/api/health') {
      const countRow = db
        .prepare("SELECT COUNT(*) AS cnt FROM submissions WHERE status = 'submitted'")
        .get();
      return sendJson(res, 200, {
        ok: true,
        maxDocMb: MAX_DOC_MB,
        maxVideoMb: MAX_VIDEO_MB,
        submittedCount: countRow.cnt,
      });
    }

    // Init submission session
    if (req.method === 'POST' && pathname === '/api/submissions/init') {
      const ip = getClientIp(req);
      if (!checkRateLimit(ip)) {
        return sendJson(res, 429, { error: '提交过于频繁，请 1 小时后再试' });
      }
      if (!checkFreeDisk()) {
        return sendJson(res, 507, { error: '服务器磁盘可用空间不足，请联系组委会' });
      }
      const body = await readJsonBody(req);
      const validated = validateInitPayload(body);
      if (validated.error) {
        return sendJson(res, 400, { error: validated.error });
      }
      const d = validated.data;
      const id = generateId();
      const uploadToken = crypto.randomBytes(24).toString('hex');
      const nowIso = new Date().toISOString();

      db.prepare(`
        INSERT INTO submissions (
          id, status, upload_token, track, team_name, project_title, leader_name,
          school, phone, email, members, advisor, summary, video_url, video_note,
          client_ip, created_at
        ) VALUES (?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        uploadToken,
        d.track,
        d.teamName,
        d.projectTitle,
        d.leaderName,
        d.school,
        d.phone,
        d.email,
        d.members,
        d.advisor,
        d.summary,
        d.videoUrl,
        d.videoNote,
        ip,
        nowIso
      );

      return sendJson(res, 201, { id, uploadToken });
    }

    // Streaming file upload: PUT /api/submissions/:id/file?kind=doc|video
    const fileMatch = pathname.match(/^\/api\/submissions\/(SZ2026-[0-9A-F]{6})\/file$/);
    if (req.method === 'PUT' && fileMatch) {
      const kind = parsedUrl.searchParams.get('kind');
      return handleFileUpload(req, res, fileMatch[1], kind);
    }

    // Finalize submission: POST /api/submissions/:id/complete
    const completeMatch = pathname.match(/^\/api\/submissions\/(SZ2026-[0-9A-F]{6})\/complete$/);
    if (req.method === 'POST' && completeMatch) {
      const id = completeMatch[1];
      const row = db.prepare('SELECT * FROM submissions WHERE id = ?').get(id);
      if (!row || row.status !== 'pending') {
        return sendJson(res, 404, { error: '报名会话不存在或已完成' });
      }
      const providedToken = String(req.headers['x-upload-token'] || '');
      if (!timingSafeEqualStr(providedToken, row.upload_token || '')) {
        return sendJson(res, 403, { error: '提交凭证无效' });
      }
      if (!row.doc_stored_name) {
        return sendJson(res, 400, { error: '请先上传技术文档后再确认提交' });
      }

      const submittedAt = new Date().toISOString();
      db.prepare(
        "UPDATE submissions SET status = 'submitted', upload_token = NULL, submitted_at = ? WHERE id = ?"
      ).run(submittedAt, id);

      return sendJson(res, 200, {
        ok: true,
        receipt: {
          id: row.id,
          track: row.track,
          teamName: row.team_name,
          projectTitle: row.project_title,
          leaderName: row.leader_name,
          school: row.school,
          docName: row.doc_original_name,
          docSize: row.doc_size,
          videoName: row.video_original_name || '',
          videoSize: row.video_size || 0,
          videoUrl: row.video_url || '',
          submittedAt,
        },
      });
    }

    // Admin Dashboard HTML
    if (req.method === 'GET' && (pathname === '/admin' || pathname === '/admin/')) {
      const adminPath = path.join(__dirname, 'admin.html');
      const html = fs.readFileSync(adminPath);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(html);
      return;
    }

    // Admin Login
    if (req.method === 'POST' && pathname === '/api/admin/login') {
      if (!ADMIN_PASSWORD) {
        return sendJson(res, 503, { error: '服务端未配置 ADMIN_PASSWORD' });
      }
      const body = await readJsonBody(req);
      const password = String(body.password || '');
      if (!timingSafeEqualStr(password, ADMIN_PASSWORD)) {
        return sendJson(res, 401, { error: '管理密码不正确' });
      }
      const token = createSessionToken();
      const maxAge = Math.floor(SESSION_TTL_MS / 1000);
      return sendJson(
        res,
        200,
        { ok: true },
        {
          'Set-Cookie': `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`,
        }
      );
    }

    // Admin Logout
    if (req.method === 'POST' && pathname === '/api/admin/logout') {
      return sendJson(
        res,
        200,
        { ok: true },
        { 'Set-Cookie': `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0` }
      );
    }

    // Admin Protected Routes
    if (pathname.startsWith('/api/admin/')) {
      if (!isAdminAuthed(req)) {
        return sendJson(res, 401, { error: '未登录或登录已过期' });
      }

      if (req.method === 'GET' && pathname === '/api/admin/submissions') {
        const rows = db
          .prepare(`
            SELECT id, track, team_name, project_title, leader_name, school, phone, email,
                   members, advisor, summary, doc_original_name, doc_size, doc_sha256,
                   video_original_name, video_size, video_sha256, video_url, video_note,
                   submitted_at, created_at
            FROM submissions
            WHERE status = 'submitted'
            ORDER BY submitted_at DESC
          `)
          .all();

        const stats = {
          total: rows.length,
          tracks: {
            '柔性电子': 0,
            '具身智能机器人': 0,
            '开源鸿蒙/RISC-V': 0,
          },
          withVideo: 0,
        };
        for (const r of rows) {
          if (r.track in stats.tracks) stats.tracks[r.track] += 1;
          if (r.doc_stored_name || r.video_original_name || r.video_url) {
            if (r.video_original_name || r.video_url) stats.withVideo += 1;
          }
        }
        return sendJson(res, 200, { stats, submissions: rows });
      }

      if (req.method === 'GET' && pathname === '/api/admin/export.csv') {
        const rows = db
          .prepare(`
            SELECT id, track, team_name, project_title, leader_name, school, phone, email,
                   members, advisor, summary, doc_original_name, doc_size,
                   video_original_name, video_size, video_url, video_note, submitted_at
            FROM submissions
            WHERE status = 'submitted'
            ORDER BY submitted_at DESC
          `)
          .all();

        const header = [
          '报名编号', '参赛赛题', '队伍名称', '作品名称', '队长姓名', '学校/单位',
          '联系电话', '联系邮箱', '其他队员', '指导老师', '作品简介',
          '技术文档文件名', '技术文档大小(B)', '视频文件名', '视频大小(B)',
          '视频外链', '视频备注', '提交时间',
        ];
        const lines = [header.map(csvCell).join(',')];
        for (const r of rows) {
          lines.push(
            [
              r.id, r.track, r.team_name, r.project_title, r.leader_name, r.school,
              r.phone, r.email, r.members, r.advisor, r.summary,
              r.doc_original_name, r.doc_size, r.video_original_name, r.video_size,
              r.video_url, r.video_note, r.submitted_at,
            ]
              .map(csvCell)
              .join(',')
          );
        }
        const csvBytes = Buffer.from(`\uFEFF${lines.join('\r\n')}`, 'utf8');
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="sz-competition-submissions.csv"',
          'Cache-Control': 'no-store',
        });
        res.end(csvBytes);
        return;
      }

      const dlMatch = pathname.match(/^\/api\/admin\/submissions\/(SZ2026-[0-9A-F]{6})\/file\/(doc|video)$/);
      if (req.method === 'GET' && dlMatch) {
        const [, id, kind] = dlMatch;
        const row = db
          .prepare("SELECT doc_original_name, doc_stored_name, video_original_name, video_stored_name FROM submissions WHERE id = ? AND status = 'submitted'")
          .get(id);
        if (!row) return sendJson(res, 404, { error: '记录不存在' });
        const stored = kind === 'doc' ? row.doc_stored_name : row.video_stored_name;
        const orig = kind === 'doc' ? row.doc_original_name : row.video_original_name;
        if (!stored) return sendJson(res, 404, { error: '未上传该文件' });

        const filePath = path.resolve(UPLOADS_DIR, id, path.basename(stored));
        if (!filePath.startsWith(UPLOADS_DIR + path.sep) || !fs.existsSync(filePath)) {
          return sendJson(res, 404, { error: '文件在磁盘上不存在' });
        }
        const stat = fs.statSync(filePath);
        const encodedName = encodeURIComponent(orig || stored);
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': stat.size,
          'Content-Disposition': `attachment; filename="${path.basename(stored)}"; filename*=UTF-8''${encodedName}`,
          'Cache-Control': 'no-store',
        });
        fs.createReadStream(filePath).pipe(res);
        return;
      }

      const delMatch = pathname.match(/^\/api\/admin\/submissions\/(SZ2026-[0-9A-F]{6})$/);
      if (req.method === 'DELETE' && delMatch) {
        const id = delMatch[1];
        const info = db.prepare('DELETE FROM submissions WHERE id = ?').run(id);
        fs.rmSync(path.join(UPLOADS_DIR, id), { recursive: true, force: true });
        if (info.changes === 0) return sendJson(res, 404, { error: '记录不存在' });
        return sendJson(res, 200, { ok: true, id });
      }

      return sendJson(res, 404, { error: '未知管理接口' });
    }

    // Standalone local static file fallback
    if (req.method === 'GET' && pathname in STATIC_FILES) {
      const entry = STATIC_FILES[pathname];
      const filePath = path.join(ROOT_DIR, entry.file);
      if (fs.existsSync(filePath)) {
        res.writeHead(200, { 'Content-Type': entry.type, 'Cache-Control': 'no-cache' });
        fs.createReadStream(filePath).pipe(res);
        return;
      }
    }

    sendJson(res, 404, { error: 'Not Found' });
  } catch (err) {
    const status = err?.statusCode || 500;
    const message = status < 500 ? err.message : '服务器内部错误';
    if (!res.headersSent) {
      sendJson(res, status, { error: message });
    }
  }
});

server.requestTimeout = 30 * 60 * 1000;
server.headersTimeout = 60 * 1000;

server.listen(PORT, HOST, () => {
  console.log(`sz-competition server listening on http://${HOST}:${PORT}`);
});
