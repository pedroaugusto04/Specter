'use client';

import * as React from 'react';
import type { ScrapingJobDto } from '@/lib/api';

export function useDashboardModals() {
  const [selectedJob, setSelectedJob] = React.useState<ScrapingJobDto | null>(null);
  const [editingJob, setEditingJob] = React.useState<ScrapingJobDto | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = React.useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = React.useState(false);
  const [isIntegrationsModalOpen, setIsIntegrationsModalOpen] = React.useState(false);

  const openCreateModal = React.useCallback(() => setIsCreateModalOpen(true), []);
  const closeCreateModal = React.useCallback(() => setIsCreateModalOpen(false), []);

  const openAuthModal = React.useCallback(() => setIsAuthModalOpen(true), []);
  const closeAuthModal = React.useCallback(() => setIsAuthModalOpen(false), []);

  const openProfileModal = React.useCallback(() => setIsProfileModalOpen(true), []);
  const closeProfileModal = React.useCallback(() => setIsProfileModalOpen(false), []);

  const openIntegrationsModal = React.useCallback(() => setIsIntegrationsModalOpen(true), []);
  const closeIntegrationsModal = React.useCallback(() => setIsIntegrationsModalOpen(false), []);

  const openJobHistory = React.useCallback((job: ScrapingJobDto) => setSelectedJob(job), []);
  const closeJobHistory = React.useCallback(() => setSelectedJob(null), []);

  const openEditJob = React.useCallback((job: ScrapingJobDto) => setEditingJob(job), []);
  const closeEditJob = React.useCallback(() => setEditingJob(null), []);

  const closeAll = React.useCallback(() => {
    setSelectedJob(null);
    setEditingJob(null);
    setIsCreateModalOpen(false);
    setIsAuthModalOpen(false);
    setIsProfileModalOpen(false);
    setIsIntegrationsModalOpen(false);
  }, []);

  return {
    selectedJob,
    editingJob,
    isCreateModalOpen,
    isAuthModalOpen,
    isProfileModalOpen,
    isIntegrationsModalOpen,
    openCreateModal,
    closeCreateModal,
    openAuthModal,
    closeAuthModal,
    openProfileModal,
    closeProfileModal,
    openIntegrationsModal,
    closeIntegrationsModal,
    openJobHistory,
    closeJobHistory,
    openEditJob,
    closeEditJob,
    closeAll,
  };
}
