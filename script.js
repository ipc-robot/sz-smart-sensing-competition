(() => {
  'use strict';

  // If you later bind an HTTPS domain to frps, set it here (e.g. 'https://submit.example.com')
  // to enable inline uploads directly from GitHub Pages HTTPS.
  const HTTPS_API_BASE = '';
  const UPLOAD_PORTAL_URL = 'http://106.53.200.120:38000/apps/sz-competition/#registration';
  const MAX_DOC_BYTES = 50 * 1024 * 1024;
  const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

  // Mobile navigation toggle
  const menuToggle = document.getElementById('menu-toggle');
  const mobileMenu = document.getElementById('mobile-menu');

  if (menuToggle && mobileMenu) {
    menuToggle.addEventListener('click', () => {
      const isOpen = mobileMenu.classList.toggle('open');
      menuToggle.setAttribute('aria-expanded', String(isOpen));
    });

    mobileMenu.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        mobileMenu.classList.remove('open');
        menuToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Active navigation link tracking on scroll
  const navLinks = Array.from(document.querySelectorAll('.site-header .nav-link'));
  const observedSections = navLinks
    .map((link) => {
      const id = link.getAttribute('href');
      return id && id.startsWith('#') ? document.querySelector(id) : null;
    })
    .filter(Boolean);

  const setActiveLink = (sectionId) => {
    navLinks.forEach((link) => {
      link.classList.toggle('active', link.getAttribute('href') === `#${sectionId}`);
    });
  };

  if ('IntersectionObserver' in window && observedSections.length > 0) {
    const navObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveLink(entry.target.id);
          }
        });
      },
      { rootMargin: '-30% 0px -55% 0px', threshold: 0.01 }
    );
    observedSections.forEach((sec) => navObserver.observe(sec));
  }

  // Scroll reveal animation with immediate viewport fallback
  const revealElements = Array.from(document.querySelectorAll('.reveal'));
  const revealImmediately = () => {
    revealElements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight - 40) {
        el.classList.add('visible');
      }
    });
  };

  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -40px 0px', threshold: 0.05 }
    );
    revealElements.forEach((el) => revealObserver.observe(el));
    revealImmediately();
  } else {
    revealElements.forEach((el) => el.classList.add('visible'));
  }

  // Live countdown to registration deadline & schedule stage highlight
  const parseLocalDate = (yyyyMmDd) => {
    const parts = yyyyMmDd.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59);
  };

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const regDeadline = parseLocalDate('2026-12-10');
  const finalDate = parseLocalDate('2026-12-26');
  const countdownBadge = document.getElementById('countdown-badge');

  if (countdownBadge) {
    const msPerDay = 86400000;
    if (now <= regDeadline) {
      const daysLeft = Math.max(0, Math.ceil((regDeadline.getTime() - now.getTime()) / msPerDay));
      countdownBadge.textContent = daysLeft === 0 ? '报名今日截止' : `距报名截止还有 ${daysLeft} 天`;
    } else if (now <= finalDate) {
      const daysToFinal = Math.max(0, Math.ceil((finalDate.getTime() - now.getTime()) / msPerDay));
      countdownBadge.textContent = daysToFinal === 0 ? '今日决赛进行中' : `距决赛还有 ${daysToFinal} 天`;
    } else {
      countdownBadge.textContent = '2026 赛事已圆满收官';
    }
  }

  const timelineCards = Array.from(document.querySelectorAll('.timeline-card[data-date]'));
  let nextMarked = false;

  timelineCards.forEach((card) => {
    const dateStr = card.getAttribute('data-date');
    const label = card.querySelector('[data-stage-label]');
    if (!dateStr || !label) return;

    const parts = dateStr.split('-').map(Number);
    const stageDay = new Date(parts[0], parts[1] - 1, parts[2]);

    if (stageDay < todayStart) {
      card.classList.add('is-past');
      label.textContent = '已到达';
    } else if (!nextMarked) {
      card.classList.add('is-next');
      label.textContent = stageDay.getTime() === todayStart.getTime() ? '今日节点' : '即将到来';
      nextMarked = true;
    } else {
      label.textContent = '待开启';
    }
  });

  // Official poster lightbox modal
  const posterOpen = document.getElementById('poster-open');
  const posterModal = document.getElementById('poster-modal');
  const posterClose = document.getElementById('poster-close');

  const closeModal = () => {
    if (!posterModal) return;
    posterModal.classList.remove('open');
    document.body.style.overflow = '';
  };

  if (posterOpen && posterModal) {
    posterOpen.addEventListener('click', () => {
      posterModal.classList.add('open');
      document.body.style.overflow = 'hidden';
    });

    posterModal.addEventListener('click', (event) => {
      if (event.target === posterModal) {
        closeModal();
      }
    });
  }

  if (posterClose) {
    posterClose.addEventListener('click', closeModal);
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && posterModal && posterModal.classList.contains('open')) {
      closeModal();
    }
  });

  // Registration & Work Upload System
  const formWrap = document.getElementById('submission-form-wrap');
  const redirectBox = document.getElementById('github-pages-redirect');
  const statusBadge = document.getElementById('upload-status-badge');
  const portalJumpLink = document.getElementById('portal-jump-link');

  if (portalJumpLink) {
    portalJumpLink.href = UPLOAD_PORTAL_URL;
  }

  const isHttpsWithoutApi = window.location.protocol === 'https:' && !HTTPS_API_BASE;
  const apiBase = HTTPS_API_BASE ? HTTPS_API_BASE.replace(/\/$/, '') : '.';

  if (formWrap && redirectBox) {
    if (isHttpsWithoutApi) {
      formWrap.classList.add('hidden');
      redirectBox.classList.remove('hidden');
      if (statusBadge) statusBadge.textContent = '统一提交入口';
      return;
    }
    formWrap.classList.remove('hidden');
    redirectBox.classList.add('hidden');
  }

  const form = document.getElementById('submission-form');
  if (!form) return;

  const summaryInput = document.getElementById('f-summary');
  const summaryCount = document.getElementById('summary-count');
  const docInput = document.getElementById('doc-input');
  const docDropzone = document.getElementById('doc-dropzone');
  const docFileInfo = document.getElementById('doc-file-info');
  const videoInput = document.getElementById('video-input');
  const videoDropzone = document.getElementById('video-dropzone');
  const videoFileInfo = document.getElementById('video-file-info');
  const videoUploadPanel = document.getElementById('video-upload-panel');
  const videoLinkPanel = document.getElementById('video-link-panel');
  const videoUrlInput = document.getElementById('f-video-url');
  const videoNoteInput = document.getElementById('f-video-note');
  const formError = document.getElementById('form-error');
  const uploadProgress = document.getElementById('upload-progress');
  const progressBar = document.getElementById('progress-bar');
  const progressLabel = document.getElementById('progress-label');
  const progressPct = document.getElementById('progress-pct');
  const submitBtn = document.getElementById('submit-btn');
  const receiptCard = document.getElementById('submit-receipt');
  const receiptIdText = document.getElementById('receipt-id-text');
  const receiptDetails = document.getElementById('receipt-details');
  const copyReceiptBtn = document.getElementById('copy-receipt-id');
  const resetFormBtn = document.getElementById('reset-form-btn');

  let selectedDoc = null;
  let selectedVideo = null;
  let videoMode = 'none';

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const escapeHtml = (str) =>
    String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const showError = (msg) => {
    if (!formError) return;
    if (!msg) {
      formError.classList.add('hidden');
      formError.textContent = '';
      return;
    }
    formError.textContent = msg;
    formError.classList.remove('hidden');
  };

  const setProgress = (pct, label) => {
    if (!uploadProgress) return;
    uploadProgress.classList.remove('hidden');
    progressBar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    progressPct.textContent = `${Math.round(pct)}%`;
    progressLabel.textContent = label;
  };

  if (summaryInput && summaryCount) {
    const updateCounter = () => {
      const len = summaryInput.value.trim().length;
      summaryCount.textContent = `${len} / 500 字（至少 20 字）`;
    };
    summaryInput.addEventListener('input', updateCounter);
    updateCounter();
  }

  const updateFilePreview = (file, dropzone, infoEl, onClear) => {
    if (!file) {
      dropzone.classList.remove('has-file');
      infoEl.classList.add('hidden');
      infoEl.innerHTML = '';
      return;
    }
    dropzone.classList.add('has-file');
    infoEl.classList.remove('hidden');
    infoEl.innerHTML = `<span>已选择：<strong>${escapeHtml(file.name)}</strong>（${formatBytes(file.size)}）</span><button type="button" class="file-clear-btn">清除</button>`;
    infoEl.querySelector('.file-clear-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      onClear();
    });
  };

  const validateDocFile = (file) => {
    const ext = `.${(file.name.split('.').pop() || '').toLowerCase()}`;
    if (!['.pdf', '.doc', '.docx'].includes(ext)) {
      return '技术文档仅支持 PDF、DOC 或 DOCX 格式';
    }
    if (file.size <= 0 || file.size > MAX_DOC_BYTES) {
      return '技术文档大小需在 1B 至 50 MB 之间';
    }
    return '';
  };

  const validateVideoFile = (file) => {
    const ext = `.${(file.name.split('.').pop() || '').toLowerCase()}`;
    if (!['.mp4', '.mov', '.webm', '.mkv'].includes(ext)) {
      return '视频文件仅支持 MP4、MOV、WebM 或 MKV 格式';
    }
    if (file.size <= 0 || file.size > MAX_VIDEO_BYTES) {
      return '视频文件大小不可超过 200 MB';
    }
    return '';
  };

  const wireDropzone = (dropzone, input, validator, assignFile) => {
    if (!dropzone || !input) return;

    const handleFiles = (files) => {
      const file = files && files[0];
      if (!file) return;
      const err = validator(file);
      if (err) {
        showError(err);
        input.value = '';
        return;
      }
      showError('');
      assignFile(file);
    };

    input.addEventListener('change', () => handleFiles(input.files));

    ['dragenter', 'dragover'].forEach((evName) => {
      dropzone.addEventListener(evName, (e) => {
        e.preventDefault();
        dropzone.classList.add('is-dragover');
      });
    });

    ['dragleave', 'drop'].forEach((evName) => {
      dropzone.addEventListener(evName, (e) => {
        e.preventDefault();
        dropzone.classList.remove('is-dragover');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      handleFiles(e.dataTransfer?.files);
    });
  };

  const setDoc = (file) => {
    selectedDoc = file;
    updateFilePreview(file, docDropzone, docFileInfo, () => {
      docInput.value = '';
      setDoc(null);
    });
  };

  const setVideo = (file) => {
    selectedVideo = file;
    updateFilePreview(file, videoDropzone, videoFileInfo, () => {
      videoInput.value = '';
      setVideo(null);
    });
  };

  wireDropzone(docDropzone, docInput, validateDocFile, setDoc);
  wireDropzone(videoDropzone, videoInput, validateVideoFile, setVideo);

  document.querySelectorAll('.segmented-tab[data-video-mode]').forEach((tab) => {
    tab.addEventListener('click', () => {
      videoMode = tab.getAttribute('data-video-mode') || 'none';
      document.querySelectorAll('.segmented-tab[data-video-mode]').forEach((t) => {
        t.classList.toggle('active', t === tab);
      });
      videoUploadPanel.classList.toggle('hidden', videoMode !== 'upload');
      videoLinkPanel.classList.toggle('hidden', videoMode !== 'link');
      if (videoMode !== 'upload') {
        videoInput.value = '';
        setVideo(null);
      }
      if (videoMode !== 'link') {
        videoUrlInput.value = '';
        videoNoteInput.value = '';
      }
    });
  });

  const uploadFileXhr = (url, file, uploadToken, onProgress) =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.setRequestHeader('X-Upload-Token', uploadToken);
      xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded);
      };
      xhr.onload = () => {
        let data = {};
        try {
          data = JSON.parse(xhr.responseText || '{}');
        } catch {
          data = {};
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data);
        } else {
          reject(new Error(data.error || `文件上传失败（HTTP ${xhr.status}）`));
        }
      };
      xhr.onerror = () => reject(new Error('网络连接中断，请检查网络后重试'));
      xhr.send(file);
    });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');

    const track = document.getElementById('f-track').value.trim();
    const teamName = document.getElementById('f-team').value.trim();
    const projectTitle = document.getElementById('f-title').value.trim();
    const leaderName = document.getElementById('f-leader').value.trim();
    const school = document.getElementById('f-school').value.trim();
    const phone = document.getElementById('f-phone').value.trim();
    const email = document.getElementById('f-email').value.trim();
    const members = document.getElementById('f-members').value.trim();
    const advisor = document.getElementById('f-advisor').value.trim();
    const summary = summaryInput.value.trim();
    const videoUrl = videoMode === 'link' ? videoUrlInput.value.trim() : '';
    const videoNote = videoMode === 'link' ? videoNoteInput.value.trim() : '';

    if (!track) return showError('请选择参赛赛题');
    if (teamName.length < 2) return showError('请填写队伍名称（至少 2 个字符）');
    if (projectTitle.length < 2) return showError('请填写作品名称（至少 2 个字符）');
    if (leaderName.length < 2) return showError('请填写队长姓名');
    if (school.length < 2) return showError('请填写学校或单位名称');
    if (!/^[\d+\-\s]{6,20}$/.test(phone)) return showError('请填写有效的联系电话');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError('请填写有效的电子邮箱');
    if (summary.length < 20 || summary.length > 500) return showError('作品简介需在 20 至 500 字之间');
    if (!selectedDoc) return showError('请上传技术文档（PDF / DOC / DOCX）');
    if (videoMode === 'upload' && !selectedVideo) return showError('请选择要上传的视频文件，或切换为“暂不提交视频”');
    if (videoMode === 'link' && !/^https?:\/\/\S+$/i.test(videoUrl)) {
      return showError('请填写有效的视频链接（以 http:// 或 https:// 开头）');
    }

    submitBtn.disabled = true;
    setProgress(3, '正在创建报名记录…');

    try {
      const initResp = await fetch(`${apiBase}/api/submissions/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
          docSize: selectedDoc.size,
          videoSize: selectedVideo ? selectedVideo.size : 0,
          videoUrl,
          videoNote,
        }),
      });
      const initData = await initResp.json().catch(() => ({}));
      if (!initResp.ok) {
        throw new Error(initData.error || `提交初始化失败（HTTP ${initResp.status}）`);
      }

      const { id, uploadToken } = initData;
      const totalBytes = selectedDoc.size + (selectedVideo ? selectedVideo.size : 0);

      await uploadFileXhr(
        `${apiBase}/api/submissions/${encodeURIComponent(id)}/file?kind=doc`,
        selectedDoc,
        uploadToken,
        (loaded) => {
          const pct = 5 + (loaded / totalBytes) * 90;
          setProgress(pct, `正在上传技术文档（${formatBytes(loaded)} / ${formatBytes(selectedDoc.size)}）…`);
        }
      );

      if (selectedVideo) {
        await uploadFileXhr(
          `${apiBase}/api/submissions/${encodeURIComponent(id)}/file?kind=video`,
          selectedVideo,
          uploadToken,
          (loaded) => {
            const pct = 5 + ((selectedDoc.size + loaded) / totalBytes) * 90;
            setProgress(pct, `正在上传作品介绍视频（${formatBytes(loaded)} / ${formatBytes(selectedVideo.size)}）…`);
          }
        );
      }

      setProgress(97, '正在校验并生成报名回执…');
      const compResp = await fetch(`${apiBase}/api/submissions/${encodeURIComponent(id)}/complete`, {
        method: 'POST',
        headers: { 'X-Upload-Token': uploadToken },
      });
      const compData = await compResp.json().catch(() => ({}));
      if (!compResp.ok) {
        throw new Error(compData.error || '最终确认提交失败');
      }

      setProgress(100, '提交完成');
      const r = compData.receipt;
      receiptIdText.textContent = r.id;
      const rows = [
        ['参赛赛题', r.track],
        ['队伍名称', r.teamName],
        ['作品名称', r.projectTitle],
        ['队长 / 单位', `${r.leaderName} · ${r.school}`],
        ['技术文档', `${r.docName}（${formatBytes(r.docSize)}）`],
        ['作品视频', r.videoName ? `${r.videoName}（${formatBytes(r.videoSize)}）` : r.videoUrl || '未提交（可选）'],
        ['提交时间', new Date(r.submittedAt).toLocaleString('zh-CN', { hour12: false })],
      ];
      receiptDetails.innerHTML = rows
        .map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`)
        .join('');

      form.classList.add('hidden');
      uploadProgress.classList.add('hidden');
      receiptCard.classList.remove('hidden');
    } catch (err) {
      showError(err.message || '提交失败，请稍后重试');
      uploadProgress.classList.add('hidden');
    } finally {
      submitBtn.disabled = false;
    }
  });

  if (copyReceiptBtn) {
    copyReceiptBtn.addEventListener('click', async () => {
      const text = receiptIdText.textContent || '';
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        copyReceiptBtn.textContent = '已复制';
        setTimeout(() => {
          copyReceiptBtn.textContent = '复制编号';
        }, 1800);
      } catch {
        copyReceiptBtn.textContent = '请手动复制';
      }
    });
  }

  if (resetFormBtn) {
    resetFormBtn.addEventListener('click', () => {
      form.reset();
      docInput.value = '';
      videoInput.value = '';
      setDoc(null);
      setVideo(null);
      videoMode = 'none';
      document.querySelectorAll('.segmented-tab[data-video-mode]').forEach((t) => {
        t.classList.toggle('active', t.getAttribute('data-video-mode') === 'none');
      });
      videoUploadPanel.classList.add('hidden');
      videoLinkPanel.classList.add('hidden');
      if (summaryCount) summaryCount.textContent = '0 / 500 字（至少 20 字）';
      showError('');
      receiptCard.classList.add('hidden');
      form.classList.remove('hidden');
    });
  }
})();
