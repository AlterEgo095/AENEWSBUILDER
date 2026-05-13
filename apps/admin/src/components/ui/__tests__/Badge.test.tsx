import React from 'react';
import { render, screen } from '@testing-library/react';
import { Badge } from '../Badge';

describe('Badge', () => {
  it('should render children text', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('should apply neutral variant by default', () => {
    const { container } = render(<Badge>Default</Badge>);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('bg-zinc-500/15');
    expect(badge.className).toContain('text-zinc-400');
  });

  it('should apply success variant', () => {
    const { container } = render(<Badge variant="success">Success</Badge>);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('bg-emerald-500/15');
    expect(badge.className).toContain('text-emerald-400');
  });

  it('should apply warning variant', () => {
    const { container } = render(<Badge variant="warning">Warning</Badge>);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('bg-amber-500/15');
    expect(badge.className).toContain('text-amber-400');
  });

  it('should apply danger variant', () => {
    const { container } = render(<Badge variant="danger">Danger</Badge>);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('bg-red-500/15');
    expect(badge.className).toContain('text-red-400');
  });

  it('should apply info variant', () => {
    const { container } = render(<Badge variant="info">Info</Badge>);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('bg-blue-500/15');
    expect(badge.className).toContain('text-blue-400');
  });

  it('should show dot by default', () => {
    const { container } = render(<Badge>Test</Badge>);
    const badge = container.firstChild as HTMLElement;
    expect(badge.querySelector('.rounded-full.h-1\\.5')).toBeInTheDocument();
  });

  it('should hide dot when dot=false', () => {
    render(<Badge dot={false}>No Dot</Badge>);
    // Should only have the text span, no dot element
    const dot = document.querySelector('.rounded-full.h-1\\.5');
    expect(dot).not.toBeInTheDocument();
  });

  it('should not show pulse animation by default', () => {
    const { container } = render(<Badge>Test</Badge>);
    const badge = container.firstChild as HTMLElement;
    expect(badge.querySelector('.animate-ping')).not.toBeInTheDocument();
  });

  it('should show pulse animation when pulse=true', () => {
    const { container } = render(<Badge pulse={true}>Pulsing</Badge>);
    const badge = container.firstChild as HTMLElement;
    expect(badge.querySelector('.animate-ping')).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    const { container } = render(<Badge className="my-badge">Custom</Badge>);
    expect(container.firstChild).toHaveClass('my-badge');
  });

  it('should use correct dot color for success variant with pulse', () => {
    const { container } = render(<Badge variant="success" pulse={true}>Pulse Success</Badge>);
    const ping = container.querySelector('.animate-ping') as HTMLElement;
    expect(ping.className).toContain('bg-emerald-400');
  });
});
