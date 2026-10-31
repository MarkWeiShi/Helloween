// Compatibility entry for the existing deployed bundle; newer source renders these links directly.
(() => {
  function addLinks() {
    const title = document.getElementById('unlock-title');
    const dialog = title?.closest('dialog');
    if (!dialog || dialog.querySelector('.unlock-policy-links')) return;
    const before = dialog.querySelector('[data-confirm-unlock]');
    if (!before) return;
    const cn = document.documentElement.lang.toLowerCase().startsWith('zh');
    const links = document.createElement('p');
    links.className = 'unlock-policy-links';
    links.style.cssText = 'font-size:12px;line-height:1.6;margin:8px 0 16px;text-align:center';
    for (const [index, path, label] of [[0, '/privacy.html', cn ? '隐私政策' : 'Privacy Policy'], [1, '/data-deletion.html', cn ? '用户数据删除说明' : 'Data Deletion']]) {
      if (index) links.append(' · ');
      const a = document.createElement('a');
      a.href = path; a.textContent = label; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.style.cssText = 'color:inherit;text-decoration:underline;text-underline-offset:3px';
      links.append(a);
    }
    before.before(links);
  }
  new MutationObserver(addLinks).observe(document.body, {childList: true, subtree: true});
  addLinks();
})();
