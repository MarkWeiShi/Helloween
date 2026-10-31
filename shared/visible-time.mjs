// Monotonic elapsed time prevents wall-clock adjustments from inflating duration.
export class VisibleTime {
  constructor(visible, wall, monotonic) {
    this.visible=visible;this.last=monotonic;this.hours=new Map([[Math.floor(wall/3600000),0]]);
  }
  sample(visible,wall,monotonic) {
    let elapsed=this.visible?Math.min(30000,Math.max(0,Math.floor(monotonic-this.last))):0;
    let cursor=wall-elapsed;
    while(elapsed>0){const hour=Math.floor(cursor/3600000),part=Math.min(elapsed,(hour+1)*3600000-cursor);this.hours.set(hour,(this.hours.get(hour)||0)+part);cursor+=part;elapsed-=part;}
    this.last=monotonic;this.visible=visible;
    // Keep the payload bounded for pages left open for many days.
    for(const hour of this.hours.keys())if(hour<Math.floor(wall/3600000)-167)this.hours.delete(hour);
    return [...this.hours];
  }
}
