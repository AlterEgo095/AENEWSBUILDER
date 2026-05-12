import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from '../Modal';

describe('Modal', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    children: <div data-testid="modal-content">Content</div>,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.style.overflow = '';
  });

  it('should return null when open is false', () => {
    const { container } = render(<Modal {...defaultProps} open={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('should render when open is true', () => {
    render(<Modal {...defaultProps} />);
    expect(screen.getByTestId('modal-content')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('should have aria-modal attribute', () => {
    render(<Modal {...defaultProps} />);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('should show title when provided', () => {
    render(<Modal {...defaultProps} title="Test Title" />);
    expect(screen.getByText('Test Title')).toBeInTheDocument();
  });

  it('should show description when provided', () => {
    render(<Modal {...defaultProps} description="Test Description" />);
    expect(screen.getByText('Test Description')).toBeInTheDocument();
  });

  it('should not show close button when no title and no description', () => {
    render(<Modal {...defaultProps} />);
    expect(screen.queryByLabelText('Close')).not.toBeInTheDocument();
  });

  it('should show close button when title is provided', () => {
    render(<Modal {...defaultProps} title="Title" />);
    expect(screen.getByLabelText('Close')).toBeInTheDocument();
  });

  it('should call onClose on backdrop click', () => {
    const onClose = vi.fn();
    render(<Modal {...defaultProps} onClose={onClose} title="Title" />);
    // Click the backdrop (the div before the dialog)
    const backdrop = screen.getByRole('dialog').previousElementSibling!;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should call onClose on X button click', () => {
    const onClose = vi.fn();
    render(<Modal {...defaultProps} onClose={onClose} title="Title" />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should call onClose on Escape key', () => {
    const onClose = vi.fn();
    render(<Modal {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should not call onClose on other key presses', () => {
    const onClose = vi.fn();
    render(<Modal {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('should lock body overflow when open', () => {
    render(<Modal {...defaultProps} />);
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('should unlock body overflow when closed', () => {
    const { rerender } = render(<Modal {...defaultProps} />);
    expect(document.body.style.overflow).toBe('hidden');

    rerender(<Modal {...defaultProps} open={false} />);
    expect(document.body.style.overflow).toBe('');
  });

  it('should apply size variants', () => {
    const { rerender, container } = render(<Modal {...defaultProps} size="sm" />);
    expect(container.querySelector('.max-w-md')).toBeInTheDocument();

    rerender(<Modal {...defaultProps} size="lg" />);
    expect(container.querySelector('.max-w-2xl')).toBeInTheDocument();

    rerender(<Modal {...defaultProps} size="xl" />);
    expect(container.querySelector('.max-w-4xl')).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    render(<Modal {...defaultProps} className="custom-class" />);
    expect(screen.getByRole('dialog')).toHaveClass('custom-class');
  });

  it('should render children', () => {
    render(
      <Modal {...defaultProps}>
        <p>Child text</p>
      </Modal>
    );
    expect(screen.getByText('Child text')).toBeInTheDocument();
  });
});
