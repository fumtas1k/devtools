import { colors, bodyEmphasis } from '@/utils/styles';

export const sectionStyle = {
  borderRadius: '0.75rem',
  border: `1px solid ${colors.border}`,
  overflow: 'hidden' as const,
};

export const sectionHeaderStyle = {
  ...bodyEmphasis,
  color: colors.text,
  padding: '0.75rem 1rem',
  margin: 0,
  background: colors.bgSubtle,
  borderBottom: `1px solid ${colors.border}`,
};

export const sectionBodyStyle = {
  padding: '1rem',
  background: colors.bg,
};
