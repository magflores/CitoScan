package org.example.citoscan.dto.response;

import lombok.Builder;
import lombok.Data;

import java.util.List;
import java.util.Map;

@Data @Builder
public class PipelineResultsResponse {
    private String possibleDiagnosis;
    private Integer tilesTotal;
    private Integer notBackgroundTotal;
    private Integer backgroundTotal;
    private Integer aptoTotal;
    private Integer noAptoTotal;

    private List<Map<String, Object>> topPatches;

    private String pipelineReportJson;
}
