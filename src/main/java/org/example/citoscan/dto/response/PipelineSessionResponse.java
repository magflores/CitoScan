package org.example.citoscan.dto.response;

import lombok.Builder;
import lombok.Data;

import java.time.Instant;

@Data @Builder
public class PipelineSessionResponse {
    private Long id;
    private Long userId;
    private String status;
    private String slideName;

    private Instant createdAt;
    private Instant startedAt;
    private Instant finishedAt;

    private Integer tilesTotal;
    private Integer notBackgroundTotal;
    private Integer backgroundTotal;
    private Integer aptoTotal;
    private Integer noAptoTotal;

    private String possibleDiagnosis;

    private String logPath;
    private String reportPath;
    private String topPatchesJsonPath;
}
