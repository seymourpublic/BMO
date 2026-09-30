import React from 'react';
import { BMOTheme } from '../utils/themes';

export type OtherButton = 'up' | 'down' | 'left' | 'right' | 'triangle' | 'green';
export type BodyMotion = 'wiggle' | 'dance' | null;

interface BMOBodyProps {
  theme: BMOTheme;
  listening: boolean;
  redDisabled?: boolean;
  onRed: () => void;
  onOtherButton: (button: OtherButton) => void;
  onBodyTap?: () => void;  // Tapping the body itself (not a button or the screen)
  motion?: BodyMotion;
  children: React.ReactNode;  // Screen contents
}

// Fixed button colours from the show (they don't change with the body theme)
const YELLOW = '#f3c52b', YELLOW_EDGE = '#b8901a';
const TRIANGLE = '#6fcdf0', TRIANGLE_EDGE = '#3b8fb0';
const GREEN = '#43b649', GREEN_EDGE = '#2a7d30';
const RED = '#e43d3d', RED_EDGE = '#9e2323';
const DOT = '#2d4f9e', DOT_EDGE = '#1c3570';

const DPadArm: React.FC<{ dir: OtherButton; className: string; onPress: (b: OtherButton) => void }> = ({ dir, className, onPress }) => (
  <button
    type="button"
    aria-label={`D-pad ${dir}`}
    onClick={() => onPress(dir)}
    className={`absolute active:brightness-90 ${className}`}
    style={{ background: YELLOW }}
  />
);

export const BMOBody: React.FC<BMOBodyProps> = ({
  theme, listening, redDisabled, onRed, onOtherButton, onBodyTap, motion, children
}) => {
  const limb = { background: theme.bodyShade, borderColor: theme.outline };

  // Width is also limited by screen height so BMO + menu fit without scrolling
  return (
    <div className={`relative mx-auto mb-[clamp(20px,5.5vh,44px)] w-[min(80vw,360px,calc((100dvh-190px)*0.62))] min-w-[220px] ${motion ? `bmo-${motion}` : ''}`}>
      {/* Arms and legs (behind the body) */}
      <div className="absolute -left-[9%] top-[52%] w-[12%] h-[10px] border-2 rounded-full -rotate-[25deg] origin-right" style={limb} />
      <div className="absolute -right-[9%] top-[52%] w-[12%] h-[10px] border-2 rounded-full rotate-[25deg] origin-left" style={limb} />
      <div className="absolute left-[28%] -bottom-[7%] w-[10px] h-[8%] border-2 rounded-b-full" style={limb} />
      <div className="absolute right-[28%] -bottom-[7%] w-[10px] h-[8%] border-2 rounded-b-full" style={limb} />

      {/* Body */}
      <div
        onClick={e => { if (!(e.target as HTMLElement).closest('button')) onBodyTap?.(); }}
        className="relative rounded-[18px] border-[3px] p-[6%] pb-[5%]"
        style={{
          background: theme.body,
          borderColor: theme.outline,
          boxShadow: `inset -10px -10px 0 ${theme.bodyShade}`
        }}
      >
        {/* Screen */}
        <div
          className="relative aspect-[4/3] rounded-[10px] border-[3px] overflow-hidden"
          style={{ background: theme.screen, borderColor: theme.outline }}
        >
          {children}
        </div>

        {/* Disc slot + small blue dot */}
        <div className="flex items-center gap-[6%] mt-[7%]">
          <div className="flex-1 h-[9px] rounded-full" style={{ background: theme.outline }} />
          <div className="w-[16px] h-[16px] rounded-full border-2" style={{ background: DOT, borderColor: DOT_EDGE }} />
        </div>

        {/* D-pad and buttons */}
        <div className="flex justify-between items-center mt-[7%]">
          <div className="relative w-[30%] aspect-square" style={{ filter: `drop-shadow(0 3px 0 ${YELLOW_EDGE})` }}>
            <DPadArm dir="up" onPress={onOtherButton} className="left-1/3 top-0 w-1/3 h-[38%] rounded-t-[4px]" />
            <DPadArm dir="down" onPress={onOtherButton} className="left-1/3 bottom-0 w-1/3 h-[38%] rounded-b-[4px]" />
            <DPadArm dir="left" onPress={onOtherButton} className="top-1/3 left-0 h-1/3 w-[38%] rounded-l-[4px]" />
            <DPadArm dir="right" onPress={onOtherButton} className="top-1/3 right-0 h-1/3 w-[38%] rounded-r-[4px]" />
            <div className="absolute left-1/3 top-1/3 w-1/3 h-1/3" style={{ background: YELLOW }} />
          </div>

          <div className="relative w-[46%] aspect-[4/3]">
            <button
              type="button"
              aria-label="Triangle button"
              onClick={() => onOtherButton('triangle')}
              className="absolute left-0 top-[6%] w-[30%] aspect-square active:translate-y-[2px]"
              style={{
                background: TRIANGLE,
                clipPath: 'polygon(50% 0, 100% 90%, 0 90%)',
                filter: `drop-shadow(0 2px 0 ${TRIANGLE_EDGE})`
              }}
            />
            <button
              type="button"
              aria-label="Green button"
              onClick={() => onOtherButton('green')}
              className="absolute left-[40%] top-0 w-[22%] aspect-square rounded-full border-2 active:translate-y-[2px]"
              style={{ background: GREEN, borderColor: GREEN_EDGE, boxShadow: `0 3px 0 ${GREEN_EDGE}` }}
            />
            <button
              type="button"
              aria-label={listening ? 'Stop listening' : 'Talk to BMO'}
              aria-pressed={listening}
              onClick={onRed}
              disabled={redDisabled}
              className={`absolute right-0 bottom-0 w-[48%] aspect-square rounded-full border-[3px] transition-transform
                active:translate-y-[3px] disabled:opacity-60 disabled:cursor-not-allowed ${listening ? 'bmo-red-glow' : ''}`}
              style={{ background: RED, borderColor: RED_EDGE, boxShadow: `0 4px 0 ${RED_EDGE}` }}
            />
          </div>
        </div>

        {/* Controller ports */}
        <div className="flex gap-[4%] mt-[5%]">
          <div className="w-[12%] h-[10px] rounded-sm" style={{ background: theme.outline }} />
          <div className="w-[12%] h-[10px] rounded-sm" style={{ background: theme.outline }} />
        </div>
      </div>
    </div>
  );
};
