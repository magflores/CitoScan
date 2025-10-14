package org.example.citoscan.repository;

import org.example.citoscan.model.PipelineSession;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PipelineSessionRepository extends JpaRepository<PipelineSession, Long> {
    Optional<PipelineSession> findByIdAndUserId(Long id, Long userId);
}
