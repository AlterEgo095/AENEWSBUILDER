import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../Button';

describe('Button', () => {
  it('should render children text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('should render with default variant (primary) and size (md)', () => {
    const { container } = render(<Button>Test</Button>);
    const btn = container.firstChild as HTMLElement;
    expect(btn.className).toContain('gradient-brand');
    expect(btn.className).toContain('px-4');
    expect(btn.className).toContain('py-2');
  });

  it('should apply primary variant styles', () => {
    const { container } = render(<Button variant="primary">Primary</Button>);
    const btn = container.firstChild as HTMLElement;
    expect(btn.className).toContain('gradient-brand');
  });

  it('should apply secondary variant styles', () => {
    const { container } = render(<Button variant="secondary">Secondary</Button>);
    const btn = container.firstChild as HTMLElement;
    expect(btn.className).toContain('bg-white/[0.08]');
  });

  it('should apply danger variant styles', () => {
    const { container } = render(<Button variant="danger">Danger</Button>);
    const btn = container.firstChild as HTMLElement;
    expect(btn.className).toContain('bg-danger/15');
  });

  it('should apply ghost variant styles', () => {
    const { container } = render(<Button variant="ghost">Ghost</Button>);
    const btn = container.firstChild as HTMLElement;
    expect(btn.className).toContain('hover:bg-white/[0.06]');
    expect(btn.className).toContain('text-zinc-400');
  });

  it('should apply outline variant styles', () => {
    const { container } = render(<Button variant="outline">Outline</Button>);
    const btn = container.firstChild as HTMLElement;
    expect(btn.className).toContain('border');
    expect(btn.className).toContain('border-white/[0.1]');
  });

  it('should apply sm size styles', () => {
    const { container } = render(<Button size="sm">Small</Button>);
    const btn = container.firstChild as HTMLElement;
    expect(btn.className).toContain('px-3');
    expect(btn.className).toContain('py-1.5');
    expect(btn.className).toContain('text-xs');
  });

  it('should apply lg size styles', () => {
    const { container } = render(<Button size="lg">Large</Button>);
    const btn = container.firstChild as HTMLElement;
    expect(btn.className).toContain('px-5');
    expect(btn.className).toContain('py-2.5');
  });

  it('should show loading spinner and disable button when loading', () => {
    render(<Button loading>Click</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    // Should show spinner (Loader2 with animate-spin)
    expect(btn.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('should disable button when disabled prop is true', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('should pass additional HTML props', () => {
    render(<Button type="submit" form="my-form" aria-label="Submit form">Submit</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('type', 'submit');
    expect(btn).toHaveAttribute('form', 'my-form');
    expect(btn).toHaveAttribute('aria-label', 'Submit form');
  });

  it('should call onClick handler', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('should not call onClick when disabled', () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Disabled</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('should render iconLeft', () => {
    render(<Button iconLeft={<span data-testid="icon-left">L</span>}>With Icon</Button>);
    expect(screen.getByTestId('icon-left')).toBeInTheDocument();
  });

  it('should render iconRight', () => {
    render(<Button iconRight={<span data-testid="icon-right">R</span>}>With Icon</Button>);
    expect(screen.getByTestId('icon-right')).toBeInTheDocument();
  });

  it('should hide iconLeft when loading', () => {
    render(<Button loading iconLeft={<span data-testid="icon-left">L</span>}>Loading</Button>);
    expect(screen.queryByTestId('icon-left')).not.toBeInTheDocument();
    expect(screen.getByRole('button').querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    const { container } = render(<Button className="my-custom-class">Custom</Button>);
    expect(container.firstChild).toHaveClass('my-custom-class');
  });
});
