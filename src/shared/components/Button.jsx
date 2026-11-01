import './button.css'

/**
 * Renders a reusable dark-theme primary or secondary action button.
 *
 * @param {{children: import('react').ReactNode, variant?: 'primary' | 'secondary' | 'outline', icon?: import('react').ReactNode, onClick?: () => void, disabled?: boolean, type?: 'button' | 'submit' | 'reset', className?: string, style?: import('react').CSSProperties}} props Button label and behavior.
 * @returns {import('react').JSX.Element} Accessible action button.
 */
function Button({
  children,
  variant = 'secondary',
  icon,
  onClick,
  disabled = false,
  type = 'button',
  className = '',
  style,
}) {
  return (
    <button
      className={`shared-button shared-button-${variant}${className ? ` ${className}` : ''}`}
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={style}
    >
      {icon}
      <span>{children}</span>
    </button>
  )
}

export default Button
