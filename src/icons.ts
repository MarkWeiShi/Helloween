const shareCurve = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="currentColor"><path d="M3 27C4 16 9 10 20 10V4L30 14L20 24V18C12 18 7 21 3 27Z"/></svg>`;
import ghost from "@phosphor-icons/core/assets/fill/ghost-fill.svg?raw";
import candy from "@phosphor-icons/core/assets/fill/gift-fill.svg?raw";
import globe from "@phosphor-icons/core/assets/regular/globe-hemisphere-west.svg?raw";
import star from "@phosphor-icons/core/assets/fill/star-four-fill.svg?raw";
import heart from "@phosphor-icons/core/assets/fill/heart-fill.svg?raw";
import sword from "@phosphor-icons/core/assets/regular/sword.svg?raw";
import share from "@phosphor-icons/core/assets/regular/paper-plane-tilt.svg?raw";
import book from "@phosphor-icons/core/assets/regular/book-open.svg?raw";
import trophy from "@phosphor-icons/core/assets/regular/trophy.svg?raw";
import close from "@phosphor-icons/core/assets/regular/x.svg?raw";
import arrow from "@phosphor-icons/core/assets/regular/arrow-right.svg?raw";
import check from "@phosphor-icons/core/assets/regular/check.svg?raw";
import sound from "@phosphor-icons/core/assets/regular/speaker-high.svg?raw";
import mute from "@phosphor-icons/core/assets/regular/speaker-slash.svg?raw";
import download from "@phosphor-icons/core/assets/regular/download-simple.svg?raw";
import moon from "@phosphor-icons/core/assets/regular/moon-stars.svg?raw";
import copy from "@phosphor-icons/core/assets/regular/copy.svg?raw";
const icons: Record<string, string> = {
  shareCurve,
  ghost,
  candy,
  globe,
  star,
  heart,
  sword,
  share,
  book,
  trophy,
  close,
  arrow,
  check,
  sound,
  mute,
  download,
  moon,
  copy,
};
export const icon = (name: string) =>
  `<span class="icon" aria-hidden="true">${icons[name] || star}</span>`;
