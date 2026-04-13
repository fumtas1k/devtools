import { caption, colors } from '../../utils/styles';

interface Props {
  id?: string;
  message: string;
}

export function ErrorMessage({ id, message }: Props) {
  return (
    <p id={id} role="alert" style={{ ...caption, color: colors.error, marginTop: '0.25rem' }}>
      {message}
    </p>
  );
}
