"use client";

import {
  ResourceWorkspace,
  type ResourceWorkspaceProps,
} from "@/components/crud/ResourceWorkspace";

/**
 * 폴더 화면.
 * 원본 `/home/` 은 카드 보기가 기본이고 "테이블 보기(SEO 전용)" 스위치로 전환되므로
 * spec.view = "folder" 로 카드 레이아웃을 사용한다.
 */
export function FolderWorkspace(props: ResourceWorkspaceProps) {
  return <ResourceWorkspace {...props} />;
}
