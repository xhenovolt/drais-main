import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

// Fallback cn function if utils not available
const cn = (...inputs: unknown[]) => {
  return inputs.filter(Boolean).join(' ');
};

// Use the fallback cn function
const properCn = cn

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
        outline: 'text-foreground',
        // Soft, token-driven status variants: a translucent tint of the semantic
        // colour + the colour itself for text. Because --success/--warning/--info/
        // --danger carry dark-mode overrides, these stay legible in both themes
        // (the old bg-emerald-100/text-emerald-700 pastels washed out on dark).
        success:
          'border-success/25 bg-success/15 text-success hover:bg-success/25',
        warning:
          'border-warning/25 bg-warning/15 text-warning hover:bg-warning/25',
        info:
          'border-info/25 bg-info/15 text-info hover:bg-info/25',
        error:
          'border-danger/25 bg-danger/15 text-danger hover:bg-danger/25',
        gray:
          'border-transparent bg-muted text-muted-foreground hover:bg-muted/80',
        purple:
          'border-transparent bg-purple-500/15 text-purple-700 hover:bg-purple-500/25 dark:text-purple-300',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={properCn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
