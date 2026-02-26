"use client";
import clsx from "clsx";
import { useI18n } from "@/components/i18n/I18nProvider";

export const Footer: React.FC = () => {
  const { t, dir } = useI18n();
  const isRTL = dir === 'rtl';

  return (
    <footer className={clsx("hidden md:flex mt-10 items-center justify-between text-xs text-gray-600 dark:text-gray-400 py-6", isRTL && "flex-row-reverse")}>
      <div className={clsx(isRTL && "text-right")}>
        © {new Date().getFullYear()} Ibun Baz Girls Secondary School Management. {t('footer.rights')}
      </div>
      <nav className={clsx("flex items-center gap-4", isRTL && "flex-row-reverse")}>
        <a href="#" className="hover:text-[var(--color-primary)]">{t('footer.docs')}</a>
        <a href="#" className="hover:text-[var(--color-primary)]">{t('footer.privacy')}</a>
        <a href="#" className="hover:text-[var(--color-primary)]">{t('footer.terms')}</a>
      </nav>
    </footer>
  );
};

export default Footer;
