(() => {
  'use strict';

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
})();
