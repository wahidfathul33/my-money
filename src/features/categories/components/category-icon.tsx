import { Icon } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { categoryColorClasses } from '../category-colors';

interface CategoryIconProps {
  icon: string;
  color: string;
  className?: string;
}

/** The colored-circle glyph used everywhere a category is listed — settings rows, pickers, quick-pick chips (task 07). */
export function CategoryIcon({ icon, color, className }: CategoryIconProps) {
  const classes = categoryColorClasses(color);
  return (
    <span
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-full',
        classes.bg,
        className,
      )}
    >
      <Icon name={icon} className={cn('size-5', classes.text)} />
    </span>
  );
}
