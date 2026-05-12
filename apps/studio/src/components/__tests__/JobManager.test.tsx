import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { JobManager } from '../JobManager';

describe('JobManager', () => {
  it('should return null when jobs array is empty', () => {
    const { container } = render(<JobManager jobs={[]} onResumeJob={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('should render header with correct count', () => {
    render(<JobManager jobs={['job-1', 'job-2', 'job-3']} onResumeJob={vi.fn()} />);
    expect(screen.getByText('Previous Jobs (3)')).toBeInTheDocument();
  });

  it('should be collapsed by default', () => {
    render(<JobManager jobs={['job-1']} onResumeJob={vi.fn()} />);
    expect(screen.queryByText('Resume')).not.toBeInTheDocument();
  });

  it('should expand on header click', () => {
    render(<JobManager jobs={['job-1']} onResumeJob={vi.fn()} />);
    fireEvent.click(screen.getByText('Previous Jobs (1)'));
    expect(screen.getByText('Resume')).toBeInTheDocument();
  });

  it('should collapse on second click', () => {
    render(<JobManager jobs={['job-1']} onResumeJob={vi.fn()} />);
    fireEvent.click(screen.getByText('Previous Jobs (1)'));
    expect(screen.getByText('Resume')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Previous Jobs (1)'));
    expect(screen.queryByText('Resume')).not.toBeInTheDocument();
  });

  it('should show last 10 jobs reversed', () => {
    const jobs = Array.from({ length: 15 }, (_, i) => `job-${i}`);
    render(<JobManager jobs={jobs} onResumeJob={vi.fn()} />);

    fireEvent.click(screen.getByText('Previous Jobs (15)'));

    const resumeButtons = screen.getAllByText('Resume');
    // Should show max 10
    expect(resumeButtons).toHaveLength(10);

    // Most recent job should be first (reversed)
    expect(screen.getByText('job-14...')).toBeInTheDocument();
    expect(screen.getByText('job-5...')).toBeInTheDocument();
  });

  it('should truncate job IDs', () => {
    const longJobId = 'abcdefghijklmnopqrstuvwxyz1234567890';
    render(<JobManager jobs={[longJobId]} onResumeJob={vi.fn()} />);

    fireEvent.click(screen.getByText('Previous Jobs (1)'));

    // JobManager truncates at 12 chars: substring(0, 12) + '...'
    expect(screen.getByText('abcdefghijkl...')).toBeInTheDocument();
  });

  it('should call onResumeJob when resume button clicked', () => {
    const onResumeJob = vi.fn();
    render(<JobManager jobs={['job-test-123']} onResumeJob={onResumeJob} />);

    fireEvent.click(screen.getByText('Previous Jobs (1)'));
    fireEvent.click(screen.getByText('Resume'));

    expect(onResumeJob).toHaveBeenCalledWith('job-test-123');
  });

  it('should show toggle icon for collapsed state', () => {
    render(<JobManager jobs={['job-1']} onResumeJob={vi.fn()} />);
    expect(screen.getByText('▶')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Previous Jobs (1)'));
    expect(screen.getByText('▼')).toBeInTheDocument();
  });
});
