#!/usr/bin/env sh

WORKING_DIR="$(cd "$(dirname "$0")" && pwd -P)"
INPUT="${WORKING_DIR}/big-buck-bunny.mp4"
DURATION="0.01s"
DEBUG=""

if [ -n "$1" ]; then
	DEBUG="foo"
fi

JOBS=""

__ffmpeg() {
	for last; do true; done
	cmd="ffmpeg -hide_banner -loglevel error -y -i '$INPUT' -t '$DURATION' $*"
	last="$(echo "$last" | sed "s~${WORKING_DIR}/~~")"
	result="$(bash -c "$cmd" 2>&1)"
	rc=$?

	# codec not supported do not report a failure or success.
	if echo "$result" | grep -q "incorrect codec parameters"; then
		rm -f "$last"
		return;
	fi

	if [ $rc -ne 0 ]; then
		if [ -z "$DEBUG" ]; then
			echo "FAIL: $last"
		else
			echo "FAIL: $cmd $result"
		fi
	else
		if [ -z "$DEBUG" ]; then
			echo "PASS: $last"
		fi
	fi
}

_ffmpeg() {
	__ffmpeg "$@" &
	JOBS="${JOBS} $!"
}

for container in mkv mp4 avi ts ogg wav webm mov; do
	dir="${WORKING_DIR}/${container}"

	rm -rf "${WORKING_DIR}/${container:?}/"
	mkdir -p "${WORKING_DIR}/${container}"
	# audio formats
	_ffmpeg -vn -c:a aac "${dir}/mp4a.40.2.${container}"
	_ffmpeg -vn -c:a aac -profile:a aac_he "${dir}/mp4a.40.5.${container}"
	_ffmpeg -vn -c:a aac -profile:a aac_he_v2 "${dir}/mp4a.40.29.${container}"
	_ffmpeg -vn -c:a mp3 "${dir}/mp4a.40.34.${container}"
	_ffmpeg -vn -c:a libopus "${dir}/opus.${container}"
	_ffmpeg -vn -c:a ac3 "${dir}/ac-3.${container}"
	_ffmpeg -vn -c:a eac3 "${dir}/ec-3.${container}"

	if [ "${container}" != 'ts' ]; then
		_ffmpeg -vn -c:a speex "${dir}/speex.${container}"
		_ffmpeg -vn -c:a libvorbis "${dir}/vorbis.${container}"
		_ffmpeg -vn -c:a flac "${dir}/flac.${container}"
		_ffmpeg -vn -c:a alac "${dir}/alac.${container}"
	fi

	# wav only supports audio
	if [ "${container}" = 'wav' ]; then
		continue;
	fi


	# TODO: use another encoder, ffmpeg does not support codecPrivate for vp09
	# profile.level.depth.chroma.[color-primary].[transferchar].[matrixco].[blacklevel]
	if [ "${container}" != 'ts' ]; then
		if [ "${container}" = 'mp4' ]; then
			_ffmpeg -an -c:v vp9 "${dir}/vp09.01.00.00.00.00.00.20.00.${container}"
		else
			_ffmpeg -an -c:v vp9 "${dir}/vp9.${container}"
		fi
		_ffmpeg -an -c:v theora "${dir}/theora.${container}"

		_ffmpeg -an -c:v vp8 "${dir}/vp8.${container}"
	fi

	# TODO: can we get avi/ts to parse codec params? since it isn't supported
	# we only check base codecs
	if [ "${container}" != 'avi' ] && [ "${container}" != 'ts' ];then
		# ffmpeg uses contrained baseline by default
		_ffmpeg -an -c:v libx264 -profile:v baseline -level 1.3 "${dir}/avc1.42c00d.${container}"
		_ffmpeg -an -c:v libx264 -profile:v main -level 3.0 "${dir}/avc1.4d401e.${container}"
		_ffmpeg -an -c:v libx264 -profile:v high -level 4.0 "${dir}/avc1.640028.${container}"
		# https://trac.ffmpeg.org/ticket/2901
		# aka profile is first 4 bits, level is second 4 bits
		_ffmpeg -an -c:v mpeg4 -profile:v 0 -level 9 "${dir}/mp4v.20.9.${container}"
		_ffmpeg -an -c:v mpeg4 -profile:v 15 -level 0 "${dir}/mp4v.20.240.${container}"

		if [ "${container}" = 'mp4' ]; then
			_ffmpeg -an -c:v libx265 -tag:v hvc1 -x265-params profile=main12:level-idc=4.0 "${dir}/hvc1.1.6.H120.90.${container}"
		fi

		_ffmpeg -an -c:v libx265 -x265-params profile=main12:level-idc=4.0 "${dir}/hev1.1.6.H120.90.${container}"
		_ffmpeg -an -c:v libx265 -x265-params profile=main12:level-idc=5.0 "${dir}/hev1.1.6.H150.90.${container}"
		_ffmpeg -an -c:v libx265 -x265-params profile=main12:level-idc=4.0:no-high-tier "${dir}/hev1.1.6.L60.90.${container}"
		_ffmpeg -an -c:v libx265 -pix_fmt yuv444p10 -x265-params profile=main12:level-idc=4.0 "${dir}/hev1.4.10.H120.9c.8.${container}"

		# video formats
		# TODO: generate more content
		# Profile.leveltier.bitdepth.[monochromeflag].[chromesubsample].[colorprimary].[transferchar].[matrixco].[full color]
		_ffmpeg -strict experimental -an -c:v av1 -cpu-used 8 "${dir}/av01.0.00M.08.0.110.${container}"
	else
		# ffmpeg does not FourCC tag HEVC in avi for whatever reason
		if [ "${container}" = 'avi' ]; then
			_ffmpeg -an -c:v libx265 -x265-params profile=main12:level-idc=4.0 -tag:v HEVC "${dir}/hev1.${container}"
		else
			_ffmpeg -an -c:v libx265 -x265-params profile=main12:level-idc=4.0 "${dir}/hev1.${container}"
		fi
		_ffmpeg -an -c:v libx264 -profile:v baseline -level 1.3 "${dir}/avc1.${container}"
		_ffmpeg -an -c:v mpeg4 -profile:v 0 -level 9 "${dir}/mp4v.20.${container}"
		if [ "${container}" != 'ts' ]; then
			_ffmpeg -strict experimental -an -c:v av1 -cpu-used 8 "${dir}/av01.${container}"
		fi
	fi

done;

rm -rf "${WORKING_DIR}/video" "${WORKING_DIR}/audio"
mkdir -p "${WORKING_DIR}/video" "${WORKING_DIR}/audio"

# audio only formats
_ffmpeg -vn -c:a aac "${WORKING_DIR}/audio/aac.aac"
_ffmpeg -vn -c:a mp3 "${WORKING_DIR}/audio/mp3.mp3"
_ffmpeg -vn -c:a speex "${WORKING_DIR}/audio/speex.ogg"
_ffmpeg -vn -c:a libopus "${WORKING_DIR}/audio/opus.ogg"
_ffmpeg -vn -c:a ac3 "${WORKING_DIR}/audio/ac-3.ac3"
_ffmpeg -vn -c:a flac "${WORKING_DIR}/audio/flac.flac"
wait

# remove any failures
find "${WORKING_DIR}/" -type f -size 0 -exec rm -f {} \;
