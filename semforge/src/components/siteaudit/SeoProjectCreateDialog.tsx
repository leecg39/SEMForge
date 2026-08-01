"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { api, ClientApiError } from "@/lib/client-api";

export interface CreatedSeoProject {
  id: string;
  name: string;
  domain: string;
}

interface DuplicateProject {
  id: string;
  name: string;
}

function duplicateProjects(error: ClientApiError): DuplicateProject[] {
  if (!error.details || typeof error.details !== "object") return [];
  const value = (error.details as { duplicateProjects?: unknown }).duplicateProjects;
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is DuplicateProject =>
      Boolean(
        item &&
          typeof item === "object" &&
          typeof (item as DuplicateProject).id === "string" &&
          typeof (item as DuplicateProject).name === "string"
      )
  );
}

export function SeoProjectCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (project: CreatedSeoProject) => void;
}) {
  const [domain, setDomain] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateProject[]>([]);

  const create = async (allowDuplicate: boolean) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await api.post<CreatedSeoProject>("/api/site-audits/projects/", {
        domain,
        name,
        allowDuplicate,
      });
      onCreated(response.data);
      onOpenChange(false);
    } catch (caught) {
      if (caught instanceof ClientApiError) {
        const found = duplicateProjects(caught);
        if (caught.code === "DUPLICATE" && found.length > 0) {
          setDuplicates(found);
          setError(null);
        } else {
          setDuplicates([]);
          setError(caught.fields?.domain ?? caught.message);
        }
      } else {
        setError("SEO 프로젝트를 만들지 못했습니다.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[700] bg-[#252a31]/65" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[710] w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[10px] bg-white shadow-[0_24px_70px_rgba(0,0,0,0.28)] focus:outline-none">
          <div className="flex items-start justify-between border-b border-app-border px-6 py-5">
            <div>
              <Dialog.Title className="text-[18px] font-semibold text-app-text">
                SEO 프로젝트 생성
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-[13px] leading-5 text-app-text-secondary">
                진단할 사이트를 등록한 다음 크롤 규칙을 설정합니다.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="닫기"
                className="flex h-8 w-8 items-center justify-center rounded-[6px] text-app-text-secondary hover:bg-app-bg"
              >
                ✕
              </button>
            </Dialog.Close>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void create(false);
            }}
          >
            <div className="space-y-5 px-6 py-5">
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-app-text">
                  도메인 <span aria-hidden="true" className="text-app-red">*</span>
                </span>
                <input
                  autoFocus
                  required
                  value={domain}
                  onChange={(event) => {
                    setDomain(event.target.value);
                    setDuplicates([]);
                    setError(null);
                  }}
                  placeholder="example.com"
                  aria-describedby="seo-project-domain-help seo-project-create-error"
                  className="h-10 w-full rounded-[7px] border border-app-border px-3 text-[14px] text-app-text outline-none focus:border-app-blue focus:ring-2 focus:ring-[#d9e6ff]"
                />
                <span id="seo-project-domain-help" className="mt-1.5 block text-[12px] text-app-text-secondary">
                  경로나 포트가 없는 공개 웹 도메인을 입력하세요. HTTPS 연결과 DNS를 실제로 확인합니다.
                </span>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-app-text">
                  프로젝트 이름 <span className="font-normal text-app-text-secondary">(선택)</span>
                </span>
                <input
                  value={name}
                  maxLength={100}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="비워 두면 도메인을 사용합니다"
                  className="h-10 w-full rounded-[7px] border border-app-border px-3 text-[14px] text-app-text outline-none focus:border-app-blue focus:ring-2 focus:ring-[#d9e6ff]"
                />
              </label>

              {duplicates.length > 0 && (
                <div className="rounded-[8px] border border-[#f1c66d] bg-[#fff8e8] p-4" role="alert">
                  <p className="text-[13px] font-semibold text-[#6d4b00]">
                    같은 도메인의 프로젝트가 이미 있습니다.
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] text-[#6d4b00]">
                    {duplicates.map((item) => <li key={item.id}>{item.name}</li>)}
                  </ul>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void create(true)}
                    className="mt-3 h-9 rounded-[7px] border border-[#c98b13] bg-white px-3 text-[13px] font-medium text-[#6d4b00] hover:bg-[#fff3d4] disabled:opacity-60"
                  >
                    그래도 별도 프로젝트로 생성
                  </button>
                </div>
              )}

              {error && (
                <p
                  id="seo-project-create-error"
                  className="rounded-[8px] border border-[#f5c2cd] bg-[#fdecef] px-3 py-2.5 text-[13px] text-[#a4002a]"
                  role="alert"
                >
                  {error}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-app-border px-6 py-4">
              <Dialog.Close asChild>
                <button type="button" className="h-10 rounded-[7px] border border-app-border px-4 text-[13px] font-medium text-app-text hover:bg-app-bg">
                  취소
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={submitting || !domain.trim() || duplicates.length > 0}
                className="h-10 rounded-[7px] bg-app-orange px-5 text-[13px] font-semibold text-white hover:bg-[#e5541f] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "도메인 확인 중…" : "프로젝트 생성"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
