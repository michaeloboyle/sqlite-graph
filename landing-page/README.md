# sqlite-graph Cloud - Landing Page

Professional landing page for sqlite-graph Cloud managed database service.

## Features

- **Hero Section** with value proposition and code example
- **Features Grid** showcasing key capabilities
- **Use Cases** for different industries
- **Pricing Tiers** with detailed comparison
- **FAQ Section** answering common questions
- **Responsive Design** for mobile, tablet, and desktop
- **Modern Animations** using Intersection Observer API
- **Performance Optimized** with lazy loading and efficient CSS

## Quick Start

### Local Development

1. **Open in browser:**
   ```bash
   open index.html
   ```

2. **Or use a local server:**
   ```bash
   # Using Python
   python -m http.server 8000

   # Using Node.js
   npx serve .

   # Using PHP
   php -S localhost:8000
   ```

3. **View at:** http://localhost:8000

### Deploy to Production

#### Vercel (Recommended)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
cd landing-page
vercel
```

#### Netlify

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy
cd landing-page
netlify deploy --prod
```

#### GitHub Pages

```bash
# Create gh-pages branch
git checkout -b gh-pages
git add landing-page/*
git commit -m "Deploy landing page"
git push origin gh-pages

# Enable GitHub Pages in repo settings
# Set source to gh-pages branch
```

#### AWS S3 + CloudFront

```bash
# Upload to S3
aws s3 sync landing-page/ s3://your-bucket-name/ --acl public-read

# Create CloudFront distribution pointing to S3
# Enable HTTPS with ACM certificate
```

## Customization

### Colors

Edit CSS variables in [css/style.css](css/style.css:11):

```css
:root {
    --primary: #FF6B35;        /* Main brand color */
    --primary-dark: #E55A2B;   /* Hover states */
    --secondary: #1F2937;      /* Text and UI elements */
}
```

### Content

1. **Hero Section** - [index.html:40](index.html:40)
   - Update title, description, and CTA buttons

2. **Features** - [index.html:120](index.html:120)
   - Add/remove feature cards
   - Update icons (emoji or SVG)

3. **Pricing** - [index.html:200](index.html:200)
   - Adjust tier names, prices, and features
   - Add/remove tiers

4. **FAQ** - [index.html:380](index.html:380)
   - Update questions and answers

### Analytics

Add your analytics provider in [js/main.js](js/main.js:1):

**Google Analytics:**
```html
<!-- Add to <head> in index.html -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_MEASUREMENT_ID');
</script>
```

**Plausible Analytics:**
```html
<!-- Add to <head> in index.html -->
<script defer data-domain="yourdomain.com" src="https://plausible.io/js/script.js"></script>
```

### Email Signup

Connect to your email service provider:

**Mailchimp:**
```javascript
// Replace showSignupModal() in js/main.js
function showSignupModal() {
    window.location.href = 'https://your-mailchimp-signup-url';
}
```

**ConvertKit:**
```javascript
function showSignupModal() {
    window.location.href = 'https://your-convertkit-form-url';
}
```

**Custom Backend:**
```javascript
async function showSignupModal() {
    const email = prompt('Enter your email:');
    if (email && isValidEmail(email)) {
        await fetch('https://api.yourdomain.com/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        alert('Thanks for signing up!');
    }
}
```

## Performance

### Lighthouse Score Targets

- **Performance:** 95+
- **Accessibility:** 100
- **Best Practices:** 100
- **SEO:** 100

### Optimization Checklist

- [x] Minified CSS and JS (do this for production)
- [x] Responsive images with lazy loading
- [x] Efficient animations (CSS transforms)
- [x] Semantic HTML for SEO
- [x] Fast fonts (system fonts fallback)
- [x] No render-blocking resources

### Production Build

**Minify CSS:**
```bash
npm install -g clean-css-cli
cleancss -o css/style.min.css css/style.css
```

**Minify JavaScript:**
```bash
npm install -g terser
terser js/main.js -o js/main.min.js -c -m
```

**Update HTML to use minified files:**
```html
<link rel="stylesheet" href="css/style.min.css">
<script src="js/main.min.js"></script>
```

## SEO

### Meta Tags

Already included in index.html:
- Title, description, keywords
- Open Graph tags (Facebook, LinkedIn)
- Twitter Card tags

### Add Structured Data

```html
<!-- Add to <head> for rich snippets -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "sqlite-graph Cloud",
  "applicationCategory": "DatabaseApplication",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  }
}
</script>
```

### Sitemap

Create `sitemap.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://sqlite-graph.io/</loc>
    <priority>1.0</priority>
  </url>
</urlset>
```

### robots.txt

Create `robots.txt`:
```
User-agent: *
Allow: /
Sitemap: https://sqlite-graph.io/sitemap.xml
```

## Browser Support

- Chrome/Edge (last 2 versions)
- Firefox (last 2 versions)
- Safari (last 2 versions)
- iOS Safari (last 2 versions)
- Android Chrome (last 2 versions)

## Dependencies

**Zero external dependencies!**

- Pure HTML, CSS, JavaScript
- System fonts (Inter with fallbacks)
- SVG icons (inline)
- No frameworks, no build tools required

## File Structure

```
landing-page/
├── index.html          # Main HTML file
├── css/
│   └── style.css      # All styles
├── js/
│   └── main.js        # Interactive features
├── assets/            # Images, logos (add as needed)
└── README.md          # This file
```

## Next Steps

1. **Set up domain:** Register sqlite-graph.io or your preferred domain
2. **Configure DNS:** Point to your hosting provider
3. **Enable HTTPS:** Use Let's Encrypt or your hosting provider's SSL
4. **Add analytics:** Google Analytics, Plausible, or Fathom
5. **Connect signup form:** Mailchimp, ConvertKit, or custom backend
6. **Set up monitoring:** Uptime Robot, Better Uptime, or Pingdom
7. **Configure CDN:** CloudFlare for global performance

## Support

- **GitHub:** https://github.com/michaeloboyle/sqlite-graph
- **Email:** hello@sqlite-graph.io
- **Issues:** https://github.com/michaeloboyle/sqlite-graph/issues

## License

MIT License - Built by Michael O'Boyle (https://oboyle.co)

---

Built with ❤️ for the sqlite-graph community
