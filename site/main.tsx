import { createRoot } from 'react-dom/client';
import { websiteLinks, news } from '@studioodle-site-content';
import './website.css';
import heroArtwork from '@studioodle-brand-art/site-illustration.svg';
import '@fontsource-variable/nunito';

const downloads = [
  { label: 'Download for Windows', url: websiteLinks.windows },
  { label: 'Google Play', url: websiteLinks.googlePlay },
  { label: 'Microsoft Store', url: websiteLinks.microsoftStore },
].filter(item => item.url);

export function Website() {
  return <>
    <header className="site-header"><a className="wordmark" href="#home" aria-label="Studioodle home"><img src="./favicon.svg" alt="" />Studioodle<span>.</span></a><nav aria-label="Main navigation"><a href="#news">Latest news</a>{websiteLinks.source && <a href={websiteLinks.source}>Source code</a>}</nav></header>
    <main id="home">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy"><p className="eyebrow">A little room for imagination</p><h1 id="hero-title">Make a mark.<br />Make it <em>yours.</em></h1><p className="intro">Welcome to Studioodle. Draw, color and play with stickers in your own free drawing studio.</p>
          <div className="download-options"><a className="launch" href="./app/">Launch Studioodle <span aria-hidden="true">&#8599;</span></a>{downloads.map(item => <a className="download" key={item.label} href={item.url}>{item.label}</a>)}</div>
          <p className="small-note">Free to create. No account needed.<br />Pictures stay in this browser on this device.</p>
          {!downloads.length && <p className="availability">Prefer an installed app? Downloads and store links are on their way.</p>}
        </div>
        <div className="artwork" role="img" aria-label="A playful doodle of a flower, sunshine and colorful pencil marks on paper"><span className="tape" /><img src={heroArtwork} alt="" /><span className="paper-caption">A blank page. Endless possibilities.</span></div>
      </section>
      <section className="news-section" id="news" aria-labelledby="news-title"><div className="section-heading"><p className="eyebrow">From the studio</p><h2 id="news-title">The latest doodles.</h2></div>{news.map(post => <article key={post.date + post.title}><time dateTime={post.date}>{new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(post.date))}</time><div><h3>{post.title}</h3>{post.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</div></article>)}</section>
      {websiteLinks.donate && <aside className="support"><h2>Keep the creativity going.</h2><p>If Studioodle brightens your day, you can help support its development and hosting.</p><a className="download" href={websiteLinks.donate}>Support Studioodle</a></aside>}
    </main><footer><p>Studioodle. A little imagination goes a long way.</p><p>Studioodle. All rights reserved.</p></footer>
  </>;
}

createRoot(document.getElementById('root')!).render(<Website />);
