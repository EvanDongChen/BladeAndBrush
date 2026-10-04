/**
 * Auto-discovery. Every page imports this once. Each glob eagerly imports every file in its
 * folder, and those files register themselves, so dropping a file into one of these folders is
 * the whole integration. The globs live here (pages may import everything) so that core/ never
 * has to know about gen/, sim/ or levels/.
 */
import.meta.glob('../core/layers/*.ts', { eager: true });
import.meta.glob('../sim/elements/*.ts', { eager: true });
import.meta.glob('../gen/elements/*.ts', { eager: true });
import.meta.glob('../sim/behaviors/*.ts', { eager: true });
import.meta.glob('../sim/abilities/*.ts', { eager: true });
import.meta.glob('../gen/features/*.ts', { eager: true });
import.meta.glob('../gen/setpieces/*.ts', { eager: true });
import.meta.glob('../gen/metrics/*.ts', { eager: true });
import.meta.glob('../levels/goals/*.ts', { eager: true });
import.meta.glob('../levels/*.ts', { eager: true });
import.meta.glob('../audio/*.ts', { eager: true });
