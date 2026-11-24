import type { FC } from "react";

import _ from "lodash";
import { Locate } from "lucide-react";
import useSWR, { type Fetcher } from "swr";
import type { ServiceSuggestionResultOriginPois } from "tmap-gl-types/types/packages/service/types/suggestion";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const fetcher: Fetcher<ServiceSuggestionResultOriginPois[], string> = (url: string) => fetch(url).then((r) => r.json());

interface Props {
  open: boolean;
  keyword: string;
  onOpenChange: (v: boolean) => void;
  moveMap: (loc: TMap.LatLngData) => void;
}

export const PlaceConfirm: FC<Props> = ({ open, keyword, onOpenChange, moveMap }) => {
  const { data, error, isLoading } = useSWR<ServiceSuggestionResultOriginPois[]>(
    keyword ? `/api/map?keyword=${encodeURIComponent(keyword)}` : null,
    fetcher,
  );

  if (!open || isLoading || error || !data || data.length === 0) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogTrigger asChild>
        {/* <Button variant="outline" onClick={() => onShow(true)}>*/}
        {/*  Show Dialog*/}
        {/* </Button>*/}
      </AlertDialogTrigger>
      <AlertDialogContent className={"z-[3000]"}>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription />
        </AlertDialogHeader>
        <ul />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">City</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((suggestion) => (
              <TableRow key={suggestion.id}>
                <TableCell className="font-medium">{suggestion.city}</TableCell>
                <TableCell>{suggestion.title}</TableCell>
                <TableCell>{_.last(_.split(suggestion.category, ":"))}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      moveMap(suggestion.location);
                    }}
                  >
                    <Locate /> 定位
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onOpenChange(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => onOpenChange(false)}>Continue</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
