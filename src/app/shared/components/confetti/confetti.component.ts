import { Component, signal, OnDestroy, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-confetti',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isVisible()) {
      <div class="confetti-overlay" (click)="dismiss()">
        <div class="celebration-content">
          <div class="congrats-text">
            <span class="emoji">🎉</span>
            <h2>Cycle Complete!</h2>
            <p>4 sessions done. Take a long break!</p>
          </div>
        </div>
        <!-- Confetti particles -->
        @for (p of particles; track p.id) {
          <div class="confetti-piece"
            [style.left.%]="p.x"
            [style.animation-delay.ms]="p.delay"
            [style.background]="p.color"
            [style.width.px]="p.size"
            [style.height.px]="p.size * p.ratio"
            [style.transform]="'rotate(' + p.rotation + 'deg)'"
          ></div>
        }
      </div>
    }
  `,
  styles: [`
    .confetti-overlay {
      position: fixed;
      inset: 0;
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(8,6,19,0.7);
      backdrop-filter: blur(4px);
      animation: fade-in 0.3s ease-out;
      cursor: pointer;
    }
    .celebration-content {
      text-align: center;
      z-index: 2;
      animation: scale-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .congrats-text {
      padding: 32px 48px;
      background: rgba(139,92,246,0.1);
      border: 1px solid rgba(139,92,246,0.3);
      border-radius: 24px;
      backdrop-filter: blur(20px);
      box-shadow: 0 0 60px rgba(139,92,246,0.2);
    }
    .emoji {
      font-size: 3rem;
      display: block;
      margin-bottom: 8px;
      animation: bounce 0.6s ease-in-out infinite alternate;
    }
    .congrats-text h2 {
      font-size: 1.5rem;
      font-weight: 800;
      background: linear-gradient(135deg, #8b5cf6, #06b6d4);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin-bottom: 4px;
    }
    .congrats-text p {
      font-size: 0.85rem;
      color: var(--color-text-secondary);
    }
    .confetti-piece {
      position: fixed;
      top: -20px;
      border-radius: 2px;
      animation: confetti-fall linear forwards;
      animation-duration: 3s;
      z-index: 1;
    }
    @keyframes confetti-fall {
      0% { top: -5%; opacity: 1; transform: translateX(0) rotateZ(0deg); }
      25% { opacity: 1; }
      100% { top: 105%; opacity: 0; transform: translateX(var(--drift, 80px)) rotateZ(720deg); }
    }
    @keyframes fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes scale-in {
      from { opacity: 0; transform: scale(0.7); }
      to { opacity: 1; transform: scale(1); }
    }
    @keyframes bounce {
      from { transform: translateY(0); }
      to { transform: translateY(-8px); }
    }
  `]
})
export class ConfettiComponent implements OnDestroy {
  isVisible = signal(false);
  particles: Array<{
    id: number; x: number; delay: number;
    color: string; size: number; ratio: number; rotation: number;
  }> = [];
  private hideTimeout: ReturnType<typeof setTimeout> | null = null;

  private readonly colors = [
    '#8b5cf6', '#06b6d4', '#ec4899', '#fbbf24',
    '#34d399', '#f87171', '#a78bfa', '#67e8f9',
  ];

  fire(): void {
    this.particles = Array.from({ length: 60 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 1200,
      color: this.colors[Math.floor(Math.random() * this.colors.length)],
      size: 6 + Math.random() * 8,
      ratio: 0.4 + Math.random() * 1.2,
      rotation: Math.random() * 360,
    }));
    this.isVisible.set(true);

    this.hideTimeout = setTimeout(() => this.dismiss(), 4500);
  }

  dismiss(): void {
    this.isVisible.set(false);
    this.particles = [];
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
  }

  ngOnDestroy(): void {
    if (this.hideTimeout) clearTimeout(this.hideTimeout);
  }
}
