// Smooth scrolling for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (href === '#' || href === '#signup' || href === '#signin' || href === '#contact' || href === '#demo') {
            e.preventDefault();
            // Handle signup/signin/contact modals here
            if (href === '#signup') {
                showSignupModal();
            } else if (href === '#signin') {
                showSigninModal();
            } else if (href === '#contact') {
                showContactModal();
            } else if (href === '#demo') {
                showDemoModal();
            }
        } else if (href.startsWith('#')) {
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        }
    });
});

// Navbar background on scroll
const nav = document.querySelector('.nav');
let lastScroll = 0;

window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;

    if (currentScroll > 100) {
        nav.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
    } else {
        nav.style.boxShadow = 'none';
    }

    lastScroll = currentScroll;
});

// Modal functionality (placeholder - you'll connect these to your actual signup/signin system)
function showSignupModal() {
    alert('Sign up functionality coming soon!\n\nFor early access, email: hello@sqlite-graph.io');
}

function showSigninModal() {
    alert('Sign in functionality coming soon!\n\nFor early access, email: hello@sqlite-graph.io');
}

function showContactModal() {
    window.location.href = 'mailto:hello@sqlite-graph.io?subject=sqlite-graph Cloud Inquiry';
}

function showDemoModal() {
    alert('Interactive demo coming soon!\n\nCheck out the GitHub repo: https://github.com/michaeloboyle/sqlite-graph');
}

// Animate stats on scroll
const observerOptions = {
    threshold: 0.5,
    rootMargin: '0px 0px -100px 0px'
};

const statsObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const stats = entry.target.querySelectorAll('.stat-value');
            stats.forEach((stat, index) => {
                setTimeout(() => {
                    stat.style.opacity = '0';
                    stat.style.transform = 'translateY(20px)';
                    setTimeout(() => {
                        stat.style.transition = 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
                        stat.style.opacity = '1';
                        stat.style.transform = 'translateY(0)';
                    }, 50);
                }, index * 100);
            });
            statsObserver.unobserve(entry.target);
        }
    });
}, observerOptions);

const heroStats = document.querySelector('.hero-stats');
if (heroStats) {
    statsObserver.observe(heroStats);
}

// Animate feature cards on scroll
const cardsObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '0';
            entry.target.style.transform = 'translateY(30px)';
            setTimeout(() => {
                entry.target.style.transition = 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }, 100);
            cardsObserver.unobserve(entry.target);
        }
    });
}, observerOptions);

document.querySelectorAll('.feature-card, .use-case, .pricing-card, .faq-item').forEach((card, index) => {
    setTimeout(() => {
        cardsObserver.observe(card);
    }, index * 50);
});

// Track button clicks (placeholder for analytics)
document.querySelectorAll('.btn').forEach(btn => {
    btn.addEventListener('click', function(e) {
        const text = this.textContent.trim();
        const href = this.getAttribute('href');

        // Send to analytics (replace with your analytics tool)
        console.log('Button clicked:', { text, href });

        // Example: Google Analytics
        // gtag('event', 'click', {
        //     'event_category': 'Button',
        //     'event_label': text,
        //     'value': href
        // });
    });
});

// Pricing tier click tracking
document.querySelectorAll('.pricing-card .btn').forEach(btn => {
    btn.addEventListener('click', function(e) {
        const tier = this.closest('.pricing-card').querySelector('.pricing-tier').textContent;
        console.log('Pricing tier selected:', tier);

        // Send to analytics
        // gtag('event', 'pricing_tier_selected', {
        //     'tier': tier
        // });
    });
});

// Copy code examples
document.querySelectorAll('.code-content pre').forEach(pre => {
    pre.style.position = 'relative';

    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy';
    copyBtn.style.position = 'absolute';
    copyBtn.style.top = '8px';
    copyBtn.style.right = '8px';
    copyBtn.style.padding = '4px 12px';
    copyBtn.style.background = 'rgba(255, 255, 255, 0.1)';
    copyBtn.style.color = 'white';
    copyBtn.style.border = '1px solid rgba(255, 255, 255, 0.2)';
    copyBtn.style.borderRadius = '4px';
    copyBtn.style.cursor = 'pointer';
    copyBtn.style.fontSize = '12px';
    copyBtn.style.fontWeight = '600';

    copyBtn.addEventListener('click', () => {
        const code = pre.querySelector('code').textContent;
        navigator.clipboard.writeText(code).then(() => {
            copyBtn.textContent = 'Copied!';
            setTimeout(() => {
                copyBtn.textContent = 'Copy';
            }, 2000);
        });
    });

    pre.appendChild(copyBtn);
});

// Email validation helper
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Newsletter signup (if you add it)
const newsletterForm = document.querySelector('#newsletter-form');
if (newsletterForm) {
    newsletterForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const email = this.querySelector('input[type="email"]').value;

        if (!isValidEmail(email)) {
            alert('Please enter a valid email address');
            return;
        }

        // Send to your backend/email service
        console.log('Newsletter signup:', email);
        alert('Thanks for signing up! We\'ll keep you updated.');
        this.reset();
    });
}

// Lazy load images (if you add them)
if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                if (img.dataset.src) {
                    img.src = img.dataset.src;
                    img.removeAttribute('data-src');
                    imageObserver.unobserve(img);
                }
            }
        });
    });

    document.querySelectorAll('img[data-src]').forEach(img => {
        imageObserver.observe(img);
    });
}

// Keyboard navigation
document.addEventListener('keydown', function(e) {
    // Escape key closes modals
    if (e.key === 'Escape') {
        // Close any open modals
        console.log('Escape pressed');
    }
});

// Performance monitoring (optional)
if ('PerformanceObserver' in window) {
    const perfObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
            console.log('Performance entry:', entry.name, entry.duration);
        }
    });

    // Uncomment to enable performance monitoring
    // perfObserver.observe({ entryTypes: ['measure', 'navigation'] });
}

// Page load analytics
window.addEventListener('load', () => {
    const loadTime = performance.timing.loadEventEnd - performance.timing.navigationStart;
    console.log('Page load time:', loadTime + 'ms');

    // Send to analytics
    // gtag('event', 'timing_complete', {
    //     'name': 'load',
    //     'value': loadTime,
    //     'event_category': 'Performance'
    // });
});

// Console easter egg
console.log('%c🚀 sqlite-graph Cloud', 'font-size: 24px; font-weight: bold; color: #FF6B35;');
console.log('%cInterested in working with us?', 'font-size: 14px; color: #6B7280;');
console.log('%cCheck out our GitHub: https://github.com/michaeloboyle/sqlite-graph', 'font-size: 12px; color: #FF6B35;');
console.log('%cOr email: hello@sqlite-graph.io', 'font-size: 12px; color: #FF6B35;');
