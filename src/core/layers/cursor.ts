import { registerLayer } from '../render';

registerLayer({
  name: 'cursor',
  order: 100,
  kind: 'canvas',
  draw: ({ g, cursor }) => {
    if (!cursor) return;
    g.strokeStyle = 'rgba(178, 34, 34, 0.9)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(cursor.x, cursor.y, Math.max(0.5, cursor.r), 0, Math.PI * 2);
    g.stroke();
  },
});
