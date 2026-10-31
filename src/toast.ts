let timer: ReturnType<typeof setTimeout> | undefined;
let current: symbol | undefined;
export function toast(text: string, duration = 4200) {
  const element = document.querySelector<HTMLElement>('#toast')!;
  const token = Symbol();
  current = token;
  clearTimeout(timer);
  element.textContent = text;
  element.classList.add('visible');
  const dismiss = () => {
    if (current !== token) return;
    clearTimeout(timer);
    element.classList.remove('visible');
    current = undefined;
  };
  timer = setTimeout(dismiss, duration);
  return dismiss;
}
