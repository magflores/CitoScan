package org.example.citoscan.repository;

import org.example.citoscan.model.PipelineSession;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PipelineSessionRepository extends JpaRepository<PipelineSession, Long> {}
